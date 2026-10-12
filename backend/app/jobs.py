"""Background job queue: real progress, cancellation between chunks, retries."""

import logging
import queue
import threading
import time
from typing import Optional

import numpy as np

from . import config, storage
from .audio_utils import (
    apply_speed,
    concat_wavs,
    ffmpeg_available,
    new_id,
    to_mp3,
    write_wav,
)
from .chunking import split_text
from .engine import EngineError, TTSEngine

logger = logging.getLogger("voice_studio.jobs")


class QueueFullError(RuntimeError):
    pass


class Job:
    def __init__(self, req: dict, voice_name: str):
        self.id = new_id()
        self.req = req
        self.voice_name = voice_name
        self.status = "queued"
        self.progress = 0.0
        self.current_chunk = 0
        self.total_chunks = 0
        self.error: Optional[str] = None
        self.created_at = time.time()
        self.started_at: Optional[float] = None
        self.finished_at: Optional[float] = None
        self.audio: Optional[dict] = None
        self._cancel = threading.Event()

    def to_dict(self) -> dict:
        engine = TTSEngine.shared()
        return {
            "id": self.id,
            "status": self.status,
            "progress": round(self.progress, 4),
            "current_chunk": self.current_chunk,
            "total_chunks": self.total_chunks,
            "error": self.error,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "text_preview": (self.req.get("text") or "")[:140],
            "voice_id": self.req.get("voice_id", "builtin"),
            "voice_name": self.voice_name,
            "model": engine.info().get("model_label", ""),
            "audio": self.audio,
            "mp3_available": bool(self.audio and self.audio.get("mp3_url")),
        }


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._order: list[str] = []
        self._queue: "queue.Queue[Optional[str]]" = queue.Queue()
        self._lock = threading.Lock()
        self._active = 0
        self._workers: list[threading.Thread] = []

    # ---------- lifecycle ----------

    def start(self) -> None:
        if self._workers:
            return
        for i in range(config.MAX_CONCURRENT_JOBS):
            t = threading.Thread(target=self._worker, name=f"tts-worker-{i}", daemon=True)
            t.start()
            self._workers.append(t)

    # ---------- public API ----------

    def submit(self, req: dict, voice_name: str = "Voira Default") -> Job:
        with self._lock:
            queued = sum(
                1 for i in self._order if i in self._jobs and self._jobs[i].status in ("queued", "processing")
            )
            if queued >= config.MAX_QUEUE_DEPTH:
                raise QueueFullError(
                    f"Queue is full ({queued} jobs pending). Please try again shortly."
                )
            job = Job(req, voice_name)
            self._jobs[job.id] = job
            self._order.append(job.id)
            self._order = self._order[-200:]
        self._queue.put(job.id)
        return job

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def list(self, limit: int = 20) -> list[dict]:
        with self._lock:
            jobs = [self._jobs[i] for i in reversed(self._order) if i in self._jobs]
        return [j.to_dict() for j in jobs[:limit]]

    def cancel(self, job_id: str) -> bool:
        job = self.get(job_id)
        if not job:
            return False
        if job.status in ("completed", "failed", "cancelled"):
            return False
        job._cancel.set()
        if job.status == "queued":
            job.status = "cancelled"
            job.finished_at = time.time()
        return True

    def has_active(self) -> bool:
        with self._lock:
            return any(
                self._jobs[i].status in ("queued", "processing") for i in self._order if i in self._jobs
            )

    # ---------- worker ----------

    def _worker(self) -> None:
        while True:
            job_id = self._queue.get()
            if job_id is None:
                continue
            job = self.get(job_id)
            if not job or job.status != "queued" or job._cancel.is_set():
                if job and job.status == "queued":
                    job.status = "cancelled"
                    job.finished_at = time.time()
                continue
            with self._lock:
                self._active += 1
            try:
                self._process(job)
            except Exception:  # noqa: BLE001
                logger.exception("Job %s crashed", job.id)
                job.status = "failed"
                job.error = "Internal server error while generating audio."
                job.finished_at = time.time()
            finally:
                with self._lock:
                    self._active -= 1

    def _process(self, job: Job) -> None:
        engine = TTSEngine.shared()
        req = job.req
        text = req["text"]

        job.status = "processing"
        job.started_at = time.time()

        chunks = split_text(text, config.CHUNK_MAX_CHARS)
        if not chunks:
            job.status = "failed"
            job.error = "Text is empty after cleanup."
            job.finished_at = time.time()
            return
        job.total_chunks = len(chunks)

        gen_id = job.id
        history_entry = {
            "id": gen_id,
            "created_at": job.created_at,
            "text": text,
            "text_preview": text[:160],
            "voice_id": req.get("voice_id", "builtin"),
            "voice_name": job.voice_name,
            "status": "processing",
            "duration_s": 0.0,
            "model": engine.info().get("model_label", ""),
            "params": {
                "exaggeration": req.get("exaggeration"),
                "cfg_weight": req.get("cfg_weight"),
                "temperature": req.get("temperature"),
                "speed": req.get("speed"),
                "language_id": req.get("language_id"),
            },
            "wav_url": None,
            "mp3_url": None,
            "error": None,
        }
        storage.add_history(history_entry)

        try:
            if job._cancel.is_set():
                raise _Cancelled()

            engine.load()
            ref_path = None
            voice_id = req.get("voice_id", "builtin")
            if voice_id not in ("", "builtin", "default"):
                vref = storage.voice_ref_path(voice_id)
                if vref is None:
                    raise EngineError("Selected voice no longer exists.")
                ref_path = str(vref)

            pieces: list[np.ndarray] = []
            for i, chunk in enumerate(chunks):
                if job._cancel.is_set():
                    raise _Cancelled()
                arr = engine.generate(
                    chunk,
                    ref_path=ref_path,
                    exaggeration=req.get("exaggeration", 0.5),
                    cfg_weight=req.get("cfg_weight", 0.5),
                    temperature=req.get("temperature", 0.8),
                    language_id=req.get("language_id"),
                )
                pieces.append(arr)
                job.current_chunk = i + 1
                job.progress = (i + 1) / (len(chunks) + 1)

            audio = concat_wavs(pieces, sr=engine.sample_rate)
            speed = float(req.get("speed") or 1.0)
            if abs(speed - 1.0) > 1e-3:
                audio = apply_speed(audio, speed)

            wav_path = storage.generation_path(gen_id, "wav")
            write_wav(wav_path, audio, engine.sample_rate)
            duration = len(audio) / float(engine.sample_rate)

            # First successful generation with a cloned voice becomes its
            # library preview (first 15 s, copy — never moves the WAV).
            if ref_path and voice_id not in ("", "builtin", "default"):
                try:
                    storage.save_preview_clip(voice_id, wav_path, engine.sample_rate, max_seconds=15.0)
                except Exception:  # noqa: BLE001 — preview must never fail the job
                    logger.warning("Preview save failed for voice %s", voice_id, exc_info=True)

            mp3_url = None
            if ffmpeg_available():
                mp3_path = storage.generation_path(gen_id, "mp3")
                if to_mp3(wav_path, mp3_path):
                    mp3_url = f"{config.API_PREFIX}/audio/{gen_id}?format=mp3"

            job.audio = {
                "id": gen_id,
                "url": f"{config.API_PREFIX}/audio/{gen_id}?format=wav",
                "format": "wav",
                "duration_s": round(duration, 3),
                "size_bytes": wav_path.stat().st_size,
                "mp3_url": mp3_url,
            }
            job.progress = 1.0
            job.status = "completed"
            job.finished_at = time.time()

            storage.update_history(
                gen_id,
                status="completed",
                duration_s=round(duration, 3),
                wav_url=job.audio["url"],
                mp3_url=mp3_url,
            )
        except _Cancelled:
            job.status = "cancelled"
            job.finished_at = time.time()
            storage.update_history(gen_id, status="cancelled", error="Cancelled by user")
        except EngineError as exc:
            job.status = "failed"
            job.error = str(exc)
            job.finished_at = time.time()
            storage.update_history(gen_id, status="failed", error=str(exc))
        except MemoryError:
            job.status = "failed"
            job.error = "Server ran out of memory while generating. Try a shorter script."
            job.finished_at = time.time()
            storage.update_history(gen_id, status="failed", error=job.error)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Generation failed for job %s", job.id)
            job.status = "failed"
            job.error = TTSEngine._safe_error(exc)
            job.finished_at = time.time()
            storage.update_history(gen_id, status="failed", error=job.error)


class _Cancelled(Exception):
    pass


manager = JobManager()
