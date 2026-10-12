import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _env(name: str, default: str) -> str:
    return os.getenv(name, default).strip() or default


MODEL_NAME = _env("CB_MODEL", "english")
DEVICE = _env("CB_DEVICE", "auto")
MTL_T3 = _env("CB_MTL_T3", "v3")
EAGER_LOAD = _env("CB_EAGER_LOAD", "0") == "1"

DATA_DIR = Path(_env("CB_DATA_DIR", str(BACKEND_DIR / "data"))).resolve()
VOICES_DIR = DATA_DIR / "voices"
GENERATIONS_DIR = DATA_DIR / "generations"
UPLOADS_DIR = DATA_DIR / "uploads"
HISTORY_FILE = DATA_DIR / "history.json"

MAX_TEXT_LENGTH = int(_env("CB_MAX_TEXT", "6000"))
CHUNK_MAX_CHARS = int(_env("CB_CHUNK_MAX_CHARS", "420"))
MAX_CONCURRENT_JOBS = max(1, int(_env("CB_MAX_CONCURRENT", "1")))
MAX_QUEUE_DEPTH = max(1, int(_env("CB_MAX_QUEUE", "25")))
MIN_REF_SECONDS = float(_env("CB_MIN_REF_SECONDS", "5.5"))
MAX_REF_SECONDS = float(_env("CB_MAX_REF_SECONDS", "30"))

CORS_ORIGINS = [o.strip() for o in _env("CB_CORS_ORIGINS", "*").split(",") if o.strip()]

DEFAULT_EXAGGERATION = 0.5
DEFAULT_CFG_WEIGHT = 0.5
DEFAULT_TEMPERATURE = 0.8
DEFAULT_SPEED = 1.0

APP_VERSION = "1.0.0"
API_PREFIX = "/api"


def ensure_dirs() -> None:
    for d in (DATA_DIR, VOICES_DIR, GENERATIONS_DIR, UPLOADS_DIR):
        d.mkdir(parents=True, exist_ok=True)
