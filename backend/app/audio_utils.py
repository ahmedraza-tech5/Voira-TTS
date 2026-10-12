"""Audio helpers: reference preparation, WAV/MP3 conversion, duration."""

import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import soundfile as sf

from . import config


class AudioValidationError(ValueError):
    pass


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def load_audio_mono(path: Path, sr: Optional[int] = None) -> Tuple[np.ndarray, int]:
    import librosa

    wav, rate = librosa.load(str(path), sr=sr, mono=True)
    if wav.size == 0:
        raise AudioValidationError("Audio file appears to be empty.")
    return wav.astype(np.float32), int(rate)


def wav_duration_seconds(path: Path) -> float:
    info = sf.info(str(path))
    return float(info.frames) / float(info.samplerate)


def prepare_reference(src: Path, dst: Path) -> float:
    """Validate + normalize a reference clip for voice cloning.

    Accepts wav/mp3/m4a/flac/ogg (anything librosa/ffmpeg can read via audioread),
    trims to MAX_REF_SECONDS, converts to 24 kHz mono WAV.
    Returns duration in seconds of the stored clip.
    """
    try:
        wav, sr = load_audio_mono(src, sr=None)
    except AudioValidationError:
        raise
    except Exception as exc:  # noqa: BLE001 - map to safe validation error
        raise AudioValidationError(
            "Could not read that audio file. Please upload WAV, MP3, M4A, FLAC or OGG."
        ) from exc

    duration = len(wav) / float(sr)
    if duration < config.MIN_REF_SECONDS:
        raise AudioValidationError(
            f"Reference audio is too short ({duration:.1f}s). "
            f"Voira needs at least {config.MIN_REF_SECONDS:.0f}s of clear speech."
        )
    if duration > config.MAX_REF_SECONDS:
        wav = wav[: int(config.MAX_REF_SECONDS * sr)]
        duration = config.MAX_REF_SECONDS

    dst.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(dst), wav, sr, subtype="PCM_16")
    return duration


def write_wav(path: Path, wav: np.ndarray, sr: int) -> None:
    """Write a float32 waveform (mono or [1, T]) to 16-bit PCM WAV."""
    arr = np.asarray(wav, dtype=np.float32)
    if arr.ndim == 2:
        arr = arr[0] if arr.shape[0] <= arr.shape[1] else arr[:, 0]
    peak = float(np.max(np.abs(arr))) if arr.size else 0.0
    if peak > 1.0:
        arr = arr / peak
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), arr, sr, subtype="PCM_16")


def apply_speed(wav: np.ndarray, speed: float) -> np.ndarray:
    """Time-stretch without changing pitch. speed > 1 = faster."""
    if abs(speed - 1.0) < 1e-3:
        return wav
    import librosa

    arr = np.asarray(wav, dtype=np.float32)
    if arr.ndim == 2:
        arr = arr[0]
    stretched = librosa.effects.time_stretch(arr, rate=float(speed))
    return stretched.astype(np.float32)


def to_mp3(wav_path: Path, mp3_path: Path, bitrate: str = "128k") -> bool:
    if not ffmpeg_available():
        return False
    mp3_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(wav_path),
        "-codec:a", "libmp3lame", "-b:a", bitrate,
        str(mp3_path),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=120)
        return mp3_path.exists() and mp3_path.stat().st_size > 0
    except Exception:
        return False


def concat_wavs(pieces: list, gap_s: float = 0.12, sr: int = 24000) -> np.ndarray:
    """Concatenate mono float32 waveforms with a short silence gap."""
    gap = np.zeros(int(gap_s * sr), dtype=np.float32)
    out: list = []
    for i, p in enumerate(pieces):
        arr = np.asarray(p, dtype=np.float32)
        if arr.ndim == 2:
            arr = arr[0] if arr.shape[0] <= arr.shape[1] else arr[:, 0]
        if i:
            out.append(gap)
        out.append(arr)
    if not out:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(out)


def safe_unlink(path: Path) -> None:
    try:
        if path.is_file():
            path.unlink()
    except OSError:
        pass


def temp_upload(suffix: str) -> Path:
    config.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    return Path(tempfile.mkstemp(suffix=suffix, dir=config.UPLOADS_DIR)[1])
