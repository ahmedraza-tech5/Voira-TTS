export type EngineInfo = {
  state: "idle" | "loading" | "ready" | "error";
  model: string;
  model_label: string;
  device: string;
  sample_rate: number | null;
  supports_exaggeration: boolean;
  supports_cfg: boolean;
  requires_reference: boolean;
  languages: { id: string; name: string }[];
  error: string | null;
};

export type Health = {
  status: "ok" | "degraded" | "starting";
  version: string;
  engine: EngineInfo;
};

export type PublicConfig = {
  max_text_length: number;
  chunk_max_chars: number;
  model: string;
  model_label: string;
  mp3_enabled: boolean;
  default_params: {
    exaggeration: number;
    cfg_weight: number;
    temperature: number;
    speed: number;
  };
  languages: { id: string; name: string }[];
};

export type Voice = {
  id: string;
  name: string;
  description: string;
  kind: "builtin" | "cloned" | "preset";
  created_at: number | null;
  duration_s: number | null;
  preview_url: string | null;
  has_preview?: boolean;
};

export type AudioOut = {
  id: string;
  url: string;
  format: string;
  duration_s: number;
  size_bytes: number;
  mp3_url?: string | null;
};

export type Job = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  current_chunk: number;
  total_chunks: number;
  error: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  text_preview: string;
  voice_id: string;
  voice_name: string;
  model: string;
  audio: (AudioOut & { mp3_url?: string | null }) | null;
  mp3_available: boolean;
};

export type HistoryItem = {
  id: string;
  created_at: number;
  text: string;
  text_preview: string;
  voice_id: string;
  voice_name: string;
  status: string;
  duration_s: number;
  model: string;
  params: Record<string, unknown>;
  wav_url: string | null;
  mp3_url: string | null;
  error: string | null;
};

export type GenerateParams = {
  text: string;
  voice_id: string;
  language_id?: string | null;
  exaggeration: number;
  cfg_weight: number;
  temperature: number;
  speed: number;
};
