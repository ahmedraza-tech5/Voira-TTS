import { api, ApiError } from "./api";
import type { Job } from "./types";

const TERMINAL = ["completed", "failed", "cancelled"] as const;

export type PollResult = {
  job: Job;
  /** true when the job reached a terminal status */
  done: boolean;
  /** set when polling gave up after repeated network failures */
  connectionLost?: boolean;
};

/**
 * Poll a job every `intervalMs`. Tolerates up to `maxConsecutiveErrors`
 * consecutive network failures before giving up (transient blips must not
 * kill the UI). Always call the returned `stop()` on unmount.
 */
export function pollJob(
  jobId: string,
  onUpdate: (result: PollResult) => void,
  opts?: { intervalMs?: number; maxConsecutiveErrors?: number }
): () => void {
  const intervalMs = opts?.intervalMs ?? 700;
  const maxErrors = opts?.maxConsecutiveErrors ?? 3;
  let consecutiveErrors = 0;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const job = await api.job(jobId);
      consecutiveErrors = 0;
      if (stopped) return;
      const done = (TERMINAL as readonly string[]).includes(job.status);
      onUpdate({ job, done });
      if (done) stop();
    } catch {
      consecutiveErrors += 1;
      if (consecutiveErrors >= maxErrors) {
        stop();
        onUpdate({
          job: {
            id: jobId,
            status: "failed",
            progress: 0,
            current_chunk: 0,
            total_chunks: 0,
            error: "Lost connection to the backend.",
            created_at: 0,
            started_at: null,
            finished_at: null,
            text_preview: "",
            voice_id: "",
            voice_name: "",
            model: "",
            audio: null,
            mp3_available: false,
          },
          done: true,
          connectionLost: true,
        });
      }
    }
  };

  const handle = setInterval(() => void tick(), intervalMs);
  void tick();

  function stop() {
    stopped = true;
    clearInterval(handle);
  }
  return stop;
}

/** Extract a user-facing message from any thrown value. */
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}
