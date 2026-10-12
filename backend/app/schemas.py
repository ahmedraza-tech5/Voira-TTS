from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class GenerateRequest(BaseModel):
    text: str = Field(..., min_length=1)
    voice_id: str = "builtin"
    language_id: Optional[str] = None
    exaggeration: float = Field(0.5, ge=0.0, le=1.0)
    cfg_weight: float = Field(0.5, ge=0.0, le=1.0)
    temperature: float = Field(0.8, ge=0.05, le=1.5)
    speed: float = Field(1.0, ge=0.5, le=2.0)

    @field_validator("text")
    @classmethod
    def _clean_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Text is empty.")
        return v


class AudioOut(BaseModel):
    id: str
    url: str
    format: str
    duration_s: float
    size_bytes: int
    mp3_url: Optional[str] = None


class JobOut(BaseModel):
    id: str
    status: str
    progress: float = 0.0
    current_chunk: int = 0
    total_chunks: int = 0
    error: Optional[str] = None
    created_at: float
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    text_preview: str = ""
    voice_id: str = "builtin"
    voice_name: str = ""
    model: str = ""
    audio: Optional[AudioOut] = None
    mp3_available: bool = False


class VoiceOut(BaseModel):
    id: str
    name: str
    description: str = ""
    kind: str  # builtin | cloned | preset
    created_at: Optional[float] = None
    duration_s: Optional[float] = None
    preview_url: Optional[str] = None


class VoiceCreateResponse(BaseModel):
    voice: VoiceOut


class HistoryItem(BaseModel):
    id: str
    created_at: float
    text: str
    text_preview: str
    voice_id: str
    voice_name: str
    status: str
    duration_s: float = 0.0
    model: str = ""
    params: dict = Field(default_factory=dict)
    wav_url: Optional[str] = None
    mp3_url: Optional[str] = None
    error: Optional[str] = None


class HealthOut(BaseModel):
    status: str
    version: str
    engine: dict


class PublicConfig(BaseModel):
    max_text_length: int
    chunk_max_chars: int
    model: str
    model_label: str
    mp3_enabled: bool
    default_params: dict
    languages: List[dict]
