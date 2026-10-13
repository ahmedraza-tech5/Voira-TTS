export function formatDate(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

export function statusTone(status: string): {
  dot: string;
  text: string;
  bg: string;
} {
  switch (status) {
    case "completed":
      return { dot: "bg-success", text: "text-success", bg: "bg-success/10" };
    case "processing":
      return { dot: "bg-brand", text: "text-brand", bg: "bg-brand-soft" };
    case "queued":
      return { dot: "bg-amber-500", text: "text-amber-600", bg: "bg-amber-500/10" };
    case "failed":
      return { dot: "bg-destructive", text: "text-destructive", bg: "bg-destructive/10" };
    case "cancelled":
      return { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted" };
    default:
      return { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted" };
  }
}
