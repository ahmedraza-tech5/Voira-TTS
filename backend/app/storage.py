"""Local JSON history + cloned-voice storage (no database)."""

import json
import shutil
import threading
import time
from pathlib import Path
from typing import List, Optional

from . import config
from .audio_utils import new_id, safe_unlink, wav_duration_seconds

_lock = threading.Lock()


def _history_path() -> Path:
    return config.HISTORY_FILE


def _read_history() -> List[dict]:
    path = _history_path()
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _write_history(items: List[dict]) -> None:
    path = _history_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def add_history(entry: dict) -> dict:
    with _lock:
        items = _read_history()
        items.insert(0, entry)
        items = items[:500]
        _write_history(items)
    return entry


def update_history(gen_id: str, **fields) -> Optional[dict]:
    with _lock:
        items = _read_history()
        for it in items:
            if it.get("id") == gen_id:
                it.update(fields)
                _write_history(items)
                return it
    return None


def list_history(limit: int = 100) -> List[dict]:
    with _lock:
        items = _read_history()
    return items[:limit]


def get_history(gen_id: str) -> Optional[dict]:
    with _lock:
        for it in _read_history():
            if it.get("id") == gen_id:
                return it
    return None


def delete_history(gen_id: str) -> bool:
    with _lock:
        items = _read_history()
        keep = [it for it in items if it.get("id") != gen_id]
        if len(keep) == len(items):
            return False
        _write_history(keep)
    for ext in ("wav", "mp3"):
        safe_unlink(config.GENERATIONS_DIR / f"{gen_id}.{ext}")
    return True


def generation_path(gen_id: str, fmt: str) -> Path:
    return config.GENERATIONS_DIR / f"{gen_id}.{fmt}"


# ---------------- voices -----------------


def _voice_dir(voice_id: str) -> Path:
    return config.VOICES_DIR / voice_id


def list_voices() -> List[dict]:
    voices: List[dict] = []
    root = config.VOICES_DIR
    if not root.exists():
        return voices
    for d in sorted(root.iterdir()):
        meta_path = d / "meta.json"
        if not meta_path.exists():
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        ref = d / "ref.wav"
        duration = meta.get("duration_s")
        if duration is None and ref.exists():
            try:
                duration = wav_duration_seconds(ref)
                meta["duration_s"] = duration
            except Exception:  # noqa: BLE001
                duration = None
        voices.append(
            {
                "id": meta.get("id", d.name),
                "name": meta.get("name", "Untitled"),
                "description": meta.get("description", ""),
                "kind": meta.get("kind", "cloned"),
                "created_at": meta.get("created_at"),
                "duration_s": duration,
                "has_preview": bool((d / "preview.wav").exists()),
                "sort_order": meta.get("sort_order", 999),
            }
        )
    # Studio presets first (by sort_order), then cloned by newest first.
    voices.sort(
        key=lambda v: (
            0 if v.get("kind") == "preset" else 1,
            v.get("sort_order", 999) if v.get("kind") == "preset" else 0,
            -(v.get("created_at") or 0),
        )
    )
    return voices


def get_voice(voice_id: str) -> Optional[dict]:
    if voice_id in ("", "builtin", "default"):
        return {"id": "builtin", "name": "Voira Default", "kind": "builtin"}
    for v in list_voices():
        if v["id"] == voice_id:
            return v
    return None


def voice_ref_path(voice_id: str) -> Optional[Path]:
    path = _voice_dir(voice_id) / "ref.wav"
    return path if path.exists() else None


def create_voice(name: str, description: str, ref_wav: Path, duration_s: float) -> dict:
    voice_id = new_id()
    d = _voice_dir(voice_id)
    d.mkdir(parents=True, exist_ok=True)
    final_ref = d / "ref.wav"
    ref_wav.replace(final_ref)
    meta = {
        "id": voice_id,
        "name": name,
        "description": description,
        "kind": "cloned",
        "created_at": time.time(),
        "duration_s": duration_s,
    }
    (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta


def delete_voice(voice_id: str) -> bool:
    d = _voice_dir(voice_id)
    if not d.exists():
        return False
    for f in d.iterdir():
        safe_unlink(f)
    try:
        d.rmdir()
        return True
    except OSError:
        return False


def save_preview(voice_id: str, wav_path: Path) -> None:
    """Copy a WAV into the voice directory as its library preview."""
    d = _voice_dir(voice_id)
    if not d.exists() or not wav_path.is_file():
        return
    target = d / "preview.wav"
    shutil.copy2(wav_path, target)


def save_preview_clip(voice_id: str, wav_path: Path, sr: int, max_seconds: float = 15.0) -> None:
    """Store at most `max_seconds` of `wav_path` as the voice preview (copy, never move)."""
    d = _voice_dir(voice_id)
    if not d.exists() or not wav_path.is_file():
        return
    target = d / "preview.wav"
    if target.exists():
        return
    try:
        import soundfile as sf

        frames = int(max(1.0, max_seconds) * sr)
        data, rate = sf.read(str(wav_path), frames=frames, dtype="float32")
        sf.write(str(target), data, rate, subtype="PCM_16")
    except Exception:  # noqa: BLE001 — preview is best-effort; never fail the job
        try:
            shutil.copy2(wav_path, target)
        except OSError:
            pass
