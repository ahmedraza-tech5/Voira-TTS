"""Voice Studio API — FastAPI + Voira TTS engine."""

import logging
import mimetypes
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from . import config, storage
from .audio_utils import (
    AudioValidationError,
    ffmpeg_available,
    new_id,
    prepare_reference,
    safe_unlink,
    temp_upload,
    wav_duration_seconds,
)
from .engine import MODEL_LABELS, SUPPORTED_LANGUAGES, EngineError, TTSEngine
from .jobs import QueueFullError, manager
from .schemas import (
    GenerateRequest,
    HealthOut,
    HistoryItem,
    JobOut,
    PublicConfig,
    VoiceOut,
)

# Log to STDOUT: Railway/containers treat STDERR output as application errors,
# which marks healthy startup lines (and uvicorn access logs) as red errors.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("voice_studio")


def _warm_heavy_imports() -> None:
    """Pre-import librosa/scipy internals so the first upload/generation
    does not block for 30-60s on lazy module loading."""
    try:
        import librosa  # noqa: F401
        import librosa.core.audio  # noqa: F401
        import librosa.effects  # noqa: F401
        import scipy.signal  # noqa: F401
    except Exception:  # noqa: BLE001
        logger.warning("Heavy import warm-up failed", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    config.ensure_dirs()
    _mark_stale_history()
    manager.start()
    threading.Thread(target=_warm_heavy_imports, daemon=True).start()
    if config.EAGER_LOAD:
        threading.Thread(target=TTSEngine.shared().warmup, daemon=True).start()
    logger.info(
        "Voice Studio API up — model=%s data=%s mp3=%s",
        config.MODEL_NAME, config.DATA_DIR, ffmpeg_available(),
    )
    yield


def _mark_stale_history() -> None:
    """After a restart no in-flight jobs survive — mark stuck entries failed."""
    try:
        items = storage.list_history(limit=500)
        stale = [it for it in items if it.get("status") in ("queued", "processing")]
        for it in stale:
            storage.update_history(
                it["id"],
                status="failed",
                error="Interrupted by server restart.",
            )
        if stale:
            logger.info("Marked %d stale history entries as failed", len(stale))
    except Exception:  # noqa: BLE001 — startup cleanup must never block boot
        logger.warning("Stale-history cleanup failed", exc_info=True)


app = FastAPI(
    title="Voira API",
    version=config.APP_VERSION,
    description="Ultra-realistic text-to-speech studio powered by the Voira model.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS if config.CORS_ORIGINS != ["*"] else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------- helpers -----------------


def _job_out(job) -> dict:
    d = job.to_dict()
    audio = d.get("audio")
    if audio and audio.get("mp3_url") and not d.get("mp3_available"):
        d["mp3_available"] = True
    return d


def _builtin_voice() -> dict:
    engine = TTSEngine.shared()
    return {
        "id": "builtin",
        "name": "Voira Default",
        "description": "The model's built-in voice.",
        "kind": "builtin",
        "created_at": None,
        "duration_s": None,
        "preview_url": None,
    }


def _range_response(path: Path, request: Request, media_type: str):
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Audio not found.")
    file_size = path.stat().st_size
    range_header = request.headers.get("range")

    start, end = 0, file_size - 1
    status_code = 200
    if range_header and range_header.startswith("bytes="):
        try:
            part = range_header.split("=", 1)[1].split(",")[0]
            s, _, e = part.partition("-")
            if s:
                start = int(s)
            if e:
                end = min(int(e), file_size - 1)
            if start > end or start >= file_size:
                raise HTTPException(
                    status_code=416,
                    headers={"Content-Range": f"bytes */{file_size}"},
                )
            status_code = 206
        except HTTPException:
            raise
        except Exception:  # noqa: BLE001
            start, end, status_code = 0, file_size - 1, 200

    length = end - start + 1

    def iter_file():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = length
            chunk = 64 * 1024
            while remaining > 0:
                data = f.read(min(chunk, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
        "Cache-Control": "public, max-age=3600",
    }
    if status_code == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"

    return StreamingResponse(iter_file(), status_code=status_code, media_type=media_type, headers=headers)


# ---------------- routes -----------------


@app.get("/api/health", response_model=HealthOut)
def health() -> HealthOut:
    engine = TTSEngine.shared()
    state = engine.state
    if state == "error":
        status = "degraded"
    elif state == "ready":
        status = "ok"
    else:
        status = "starting"
    return HealthOut(status=status, version=config.APP_VERSION, engine=engine.info())


@app.get("/api/engine")
def engine_info():
    return TTSEngine.shared().info()


@app.post("/api/engine/load")
def engine_load():
    """Trigger model load (useful on cold starts)."""
    engine = TTSEngine.shared()
    if engine.ready:
        return engine.info()
    threading.Thread(target=engine.warmup, daemon=True).start()
    return {"state": "loading", **engine.info()}


@app.get("/api/config", response_model=PublicConfig)
def public_config() -> PublicConfig:
    engine = TTSEngine.shared()
    info = engine.info()
    return PublicConfig(
        max_text_length=config.MAX_TEXT_LENGTH,
        chunk_max_chars=config.CHUNK_MAX_CHARS,
        model=config.MODEL_NAME,
        model_label=info["model_label"],
        mp3_enabled=ffmpeg_available(),
        default_params={
            "exaggeration": config.DEFAULT_EXAGGERATION,
            "cfg_weight": config.DEFAULT_CFG_WEIGHT,
            "temperature": config.DEFAULT_TEMPERATURE,
            "speed": config.DEFAULT_SPEED,
        },
        languages=SUPPORTED_LANGUAGES if config.MODEL_NAME == "multilingual" else [],
    )


@app.post("/api/generate", response_model=JobOut)
def generate(req: GenerateRequest):
    if len(req.text) > config.MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Text is too long ({len(req.text)} chars). Limit is {config.MAX_TEXT_LENGTH}.",
        )

    engine = TTSEngine.shared()
    if engine.state == "error":
        raise HTTPException(status_code=503, detail=f"Model unavailable: {engine.error}")

    voice = storage.get_voice(req.voice_id)
    if voice is None:
        raise HTTPException(status_code=404, detail="Voice not found.")

    payload = req.model_dump()
    try:
        job = manager.submit(payload, voice_name=voice.get("name", "Voira Default"))
    except QueueFullError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    if not engine.ready and engine.state != "loading":
        threading.Thread(target=engine.warmup, daemon=True).start()
    return _job_out(job)


@app.get("/api/jobs/{job_id}", response_model=JobOut)
def job_status(job_id: str):
    job = manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return _job_out(job)


@app.get("/api/jobs")
def jobs_list(limit: int = Query(20, ge=1, le=100)):
    return manager.list(limit)


@app.post("/api/jobs/{job_id}/cancel", response_model=JobOut)
def job_cancel(job_id: str):
    job = manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    manager.cancel(job_id)
    return _job_out(job)


@app.get("/api/voices", response_model=list[VoiceOut])
def voices():
    engine = TTSEngine.shared()
    out: list[dict] = []
    # Built-in model voice is only offered when the checkpoint provides one.
    if not (engine.ready and engine.requires_reference):
        out.append(_builtin_voice())
    for v in storage.list_voices():
        item = dict(v)
        if v.get("has_preview"):
            item["preview_url"] = f"{config.API_PREFIX}/voices/{v['id']}/preview"
        out.append(item)
    return out


@app.post("/api/voices", response_model=VoiceOut)
def create_voice(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(""),
    consent: str = Form(...),
):
    """Sync endpoint: runs in FastAPI's threadpool so audio validation
    never blocks the event loop."""
    if consent.lower() not in ("true", "1", "yes", "on"):
        raise HTTPException(
            status_code=400,
            detail="You must confirm you have permission to clone this voice.",
        )
    name = name.strip()
    if not name or len(name) > 60:
        raise HTTPException(status_code=400, detail="Voice name must be 1–60 characters.")

    suffix = Path(file.filename or "ref.wav").suffix.lower() or ".wav"
    if suffix not in (".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac", ".mp4", ".webm"):
        raise HTTPException(status_code=400, detail="Unsupported file type.")

    tmp = temp_upload(suffix)
    stored = temp_upload(".wav")
    try:
        size = 0
        with open(tmp, "wb") as out:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > 50 * 1024 * 1024:
                    raise HTTPException(status_code=400, detail="File is too large (max 50 MB).")
                out.write(chunk)
        if size == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        try:
            duration = prepare_reference(tmp, stored)
        except AudioValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        meta = storage.create_voice(name, description.strip()[:300], stored, duration)
        return {
            "id": meta["id"],
            "name": meta["name"],
            "description": meta["description"],
            "kind": "cloned",
            "created_at": meta["created_at"],
            "duration_s": meta["duration_s"],
            "preview_url": None,
        }
    finally:
        safe_unlink(tmp)
        safe_unlink(stored)


@app.get("/api/voices/{voice_id}/preview")
def voice_preview(voice_id: str, request: Request):
    path = storage._voice_dir(voice_id) / "preview.wav"
    return _range_response(path, request, "audio/wav")


@app.delete("/api/voices/{voice_id}")
def delete_voice(voice_id: str):
    if not storage.delete_voice(voice_id):
        raise HTTPException(status_code=404, detail="Voice not found.")
    return {"deleted": True}


@app.get("/api/history", response_model=list[HistoryItem])
def history(limit: int = Query(100, ge=1, le=500)):
    items = storage.list_history(limit)
    out = []
    for it in items:
        out.append(
            HistoryItem(
                id=it.get("id", ""),
                created_at=it.get("created_at", 0),
                text=it.get("text", ""),
                text_preview=it.get("text_preview", ""),
                voice_id=it.get("voice_id", "builtin"),
                voice_name=it.get("voice_name", ""),
                status=it.get("status", "unknown"),
                duration_s=float(it.get("duration_s") or 0),
                model=it.get("model", ""),
                params=it.get("params") or {},
                wav_url=it.get("wav_url"),
                mp3_url=it.get("mp3_url"),
                error=it.get("error"),
            )
        )
    return out


@app.delete("/api/history/{gen_id}")
def history_delete(gen_id: str):
    if not storage.delete_history(gen_id):
        raise HTTPException(status_code=404, detail="Generation not found.")
    return {"deleted": True}


@app.get("/api/audio/{gen_id}")
def get_audio(gen_id: str, request: Request, format: str = Query("wav"), download: bool = Query(False)):
    if format not in ("wav", "mp3"):
        raise HTTPException(status_code=400, detail="Format must be wav or mp3.")
    if not gen_id.isalnum() or len(gen_id) > 32:
        raise HTTPException(status_code=400, detail="Invalid audio id.")
    path = storage.generation_path(gen_id, format)
    if format == "mp3" and not path.exists():
        # graceful fallback when ffmpeg is not installed
        path = storage.generation_path(gen_id, "wav")
        format = "wav"
    media = mimetypes.guess_type(path.name)[0] or ("audio/wav" if format == "wav" else "audio/mpeg")
    resp = _range_response(path, request, media)
    if download:
        filename = f"voice-studio-{gen_id[:8]}.{format}"
        resp.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp


@app.exception_handler(EngineError)
async def engine_error_handler(request: Request, exc: EngineError):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.get("/")
def root():
    return {
        "name": "Voice Studio API",
        "version": config.APP_VERSION,
        "docs": "/docs",
        "engine": TTSEngine.shared().info(),
    }
