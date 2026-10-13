import type {
  GenerateParams,
  Health,
  HistoryItem,
  Job,
  PublicConfig,
  Voice,
} from "./types";

export const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      0,
      "Cannot reach the TTS backend. Is the server running?"
    );
  }

  let body: unknown = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const detail =
      (body as { detail?: string } | null)?.detail ??
      `Request failed (${res.status})`;
    throw new ApiError(res.status, detail);
  }
  return body as T;
}

export const api = {
  health: () => request<Health>("/api/health"),
  config: () => request<PublicConfig>("/api/config"),
  loadEngine: () => request<unknown>("/api/engine/load", { method: "POST" }),

  voices: () => request<Voice[]>("/api/voices"),
  deleteVoice: (id: string) =>
    request<{ deleted: boolean }>(`/api/voices/${id}`, { method: "DELETE" }),
  createVoice: (form: FormData) =>
    request<Voice>("/api/voices", { method: "POST", body: form }),

  generate: (payload: GenerateParams) =>
    request<Job>("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  job: (id: string) => request<Job>(`/api/jobs/${id}`),
  cancelJob: (id: string) =>
    request<Job>(`/api/jobs/${id}/cancel`, { method: "POST" }),

  history: () => request<HistoryItem[]>("/api/history"),
  deleteHistory: (id: string) =>
    request<{ deleted: boolean }>(`/api/history/${id}`, { method: "DELETE" }),
};

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Cross-origin-safe file download: fetch → blob → anchor click.
 * (A bare `<a download href>` is ignored by browsers on another origin.)
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 5000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}
