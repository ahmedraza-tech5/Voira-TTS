"""Chatterbox model wrapper: lazy singleton load + generation.

Loads the real Chatterbox TTS model from the official package
(github.com/resemble-ai/chatterbox). One model per process.
"""

import logging
import threading
from typing import Optional

import numpy as np

from . import config

logger = logging.getLogger("voice_studio.engine")

MODEL_LABELS = {
    "english": "Voira English",
    "multilingual": "Voira Multilingual",
    "turbo": "Voira Turbo",
    "nano": "Voira Nano",
}

# Languages supported by the multilingual checkpoint (see official README)
SUPPORTED_LANGUAGES = [
    {"id": "ar", "name": "Arabic"},
    {"id": "da", "name": "Danish"},
    {"id": "de", "name": "German"},
    {"id": "el", "name": "Greek"},
    {"id": "en", "name": "English"},
    {"id": "es", "name": "Spanish"},
    {"id": "fi", "name": "Finnish"},
    {"id": "fr", "name": "French"},
    {"id": "he", "name": "Hebrew"},
    {"id": "hi", "name": "Hindi"},
    {"id": "it", "name": "Italian"},
    {"id": "ja", "name": "Japanese"},
    {"id": "ko", "name": "Korean"},
    {"id": "ms", "name": "Malay"},
    {"id": "nl", "name": "Dutch"},
    {"id": "no", "name": "Norwegian"},
    {"id": "pl", "name": "Polish"},
    {"id": "pt", "name": "Portuguese"},
    {"id": "ru", "name": "Russian"},
    {"id": "sv", "name": "Swedish"},
    {"id": "sw", "name": "Swahili"},
    {"id": "tr", "name": "Turkish"},
    {"id": "zh", "name": "Chinese"},
]


class EngineError(RuntimeError):
    pass


class TTSEngine:
    """Thread-safe singleton around one Chatterbox model instance."""

    _instance: Optional["TTSEngine"] = None
    _instance_lock = threading.Lock()

    @classmethod
    def shared(cls) -> "TTSEngine":
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def __init__(self) -> None:
        self.model = None
        self.kind = config.MODEL_NAME
        self.device = "cpu"
        self.sample_rate = 24000
        self.state = "idle"  # idle | loading | ready | error
        self.error: Optional[str] = None
        self._load_lock = threading.Lock()
        self._gen_lock = threading.Lock()

    # ---------- status ----------

    @property
    def ready(self) -> bool:
        return self.state == "ready" and self.model is not None

    @property
    def requires_reference(self) -> bool:
        """Turbo/Nano have no built-in voice unless the checkpoint ships conds."""
        if self.kind in ("turbo", "nano"):
            return getattr(self.model, "conds", None) is None if self.model else True
        return False

    @property
    def supports_exaggeration(self) -> bool:
        return self.kind in ("english", "multilingual")

    def info(self) -> dict:
        return {
            "state": self.state,
            "model": self.kind,
            "model_label": MODEL_LABELS.get(self.kind, self.kind),
            "device": self.device,
            "sample_rate": self.sample_rate if self.ready else None,
            "supports_exaggeration": self.supports_exaggeration,
            "supports_cfg": self.supports_exaggeration,
            "requires_reference": self.requires_reference if self.ready else self.kind in ("turbo", "nano"),
            "languages": SUPPORTED_LANGUAGES if self.kind == "multilingual" else [],
            "error": self.error,
        }

    # ---------- loading ----------

    def load(self) -> None:
        if self.ready:
            return
        with self._load_lock:
            if self.ready:
                return
            self.state = "loading"
            self.error = None
            try:
                import torch

                if config.DEVICE == "auto":
                    if torch.cuda.is_available():
                        self.device = "cuda"
                    elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
                        self.device = "mps"
                    else:
                        self.device = "cpu"
                else:
                    self.device = config.DEVICE

                logger.info("Loading Chatterbox '%s' on %s ...", self.kind, self.device)
                if self.kind == "english":
                    from chatterbox.tts import ChatterboxTTS

                    self.model = ChatterboxTTS.from_pretrained(self.device)
                elif self.kind == "multilingual":
                    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

                    self.model = ChatterboxMultilingualTTS.from_pretrained(
                        self.device, t3_model=config.MTL_T3
                    )
                elif self.kind in ("turbo", "nano"):
                    from chatterbox.tts_turbo import ChatterboxTurboTTS

                    self.model = ChatterboxTurboTTS.from_pretrained(
                        self.device, nano=(self.kind == "nano")
                    )
                else:
                    raise EngineError(f"Unknown CB_MODEL '{self.kind}'")

                self.sample_rate = int(getattr(self.model, "sr", 24000))
                self.state = "ready"
                logger.info("Model ready (sr=%s)", self.sample_rate)
            except Exception as exc:  # noqa: BLE001
                self.state = "error"
                self.error = self._safe_error(exc)
                logger.exception("Model load failed")
                raise EngineError(self.error) from exc

    def warmup(self) -> None:
        try:
            self.load()
        except Exception:  # noqa: BLE001 - warmup must never crash the app
            logger.exception("Warmup failed")

    @staticmethod
    def _safe_error(exc: Exception) -> str:
        name = type(exc).__name__
        msg = str(exc)
        # Never leak filesystem paths or secrets to API clients.
        msg = msg.replace(str(config.DATA_DIR), "...").replace(config.DATA_DIR.name, "...")
        if len(msg) > 220:
            msg = msg[:220] + "…"
        return f"{name}: {msg}" if msg else name

    # ---------- generation ----------

    def generate(
        self,
        text: str,
        ref_path: Optional[str] = None,
        exaggeration: float = 0.5,
        cfg_weight: float = 0.5,
        temperature: float = 0.8,
        language_id: Optional[str] = None,
    ) -> np.ndarray:
        """Run Chatterbox inference for one chunk. Returns mono float32 array."""
        self.load()
        with self._gen_lock:
            kwargs = {"temperature": float(temperature)}
            if self.kind in ("english", "multilingual"):
                kwargs.update(
                    exaggeration=float(exaggeration),
                    cfg_weight=float(cfg_weight),
                )
                if ref_path:
                    kwargs["audio_prompt_path"] = ref_path
                if self.kind == "multilingual":
                    kwargs["language_id"] = language_id or "en"
            else:  # turbo / nano
                if ref_path:
                    kwargs["audio_prompt_path"] = ref_path
                elif getattr(self.model, "conds", None) is None:
                    raise EngineError(
                        "This model needs a reference voice. Select a cloned voice first."
                    )
            wav = self.model.generate(text, **kwargs)
            import torch

            if isinstance(wav, torch.Tensor):
                arr = wav.detach().cpu().float().numpy()
            else:
                arr = np.asarray(wav, dtype=np.float32)
            if arr.ndim == 2:
                arr = arr[0] if arr.shape[0] <= arr.shape[1] else arr[:, 0]
            return arr.astype(np.float32)
