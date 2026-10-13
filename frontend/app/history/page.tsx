"use client";

import { useEffect, useState } from "react";
import {
  Download,
  History as HistoryIcon,
  Loader2,
  Play,
  Search,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, absoluteUrl, ApiError, downloadFile } from "@/lib/api";
import type { HistoryItem } from "@/lib/types";
import { formatDate, formatDuration, statusTone, truncate } from "@/lib/format";

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<HistoryItem | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  const refresh = async () => {
    try {
      setItems(await api.history());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    return () => {
      audio?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = items.filter((i) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      i.text.toLowerCase().includes(q) ||
      i.voice_name.toLowerCase().includes(q) ||
      i.status.includes(q)
    );
  });

  const togglePlay = (item: HistoryItem) => {
    if (!item.wav_url) return;
    audio?.pause();
    if (playingId === item.id) {
      setPlayingId(null);
      return;
    }
    const el = new Audio(absoluteUrl(item.wav_url));
    el.onended = () => setPlayingId(null);
    void el.play().catch(() => setPlayingId(null));
    setAudio(el);
    setPlayingId(item.id);
  };

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await api.deleteHistory(deleting.id);
      setItems((prev) => prev.filter((i) => i.id !== deleting.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed.");
    } finally {
      setDeleting(null);
    }
  };

  const download = (url: string, name: string) => {
    void downloadFile(url, name);
  };

  return (
    <div className="space-y-5">
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by text, voice or status…"
          className="h-9 rounded-[10px] bg-card pl-9"
        />
      </div>

      {error && (
        <p className="rounded-[10px] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-[14px] bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[16px] border border-dashed border-border bg-card px-6 py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-brand-soft text-brand">
            <HistoryIcon className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium">
              {query ? "Nothing matches that search" : "No generations yet"}
            </p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              {query
                ? "Try another keyword."
                : "Everything you generate in the Studio lands here with playback and downloads."}
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[16px] border border-border bg-card">
          <div className="hidden grid-cols-[1fr_140px_90px_130px_170px] gap-3 border-b border-border bg-canvas/70 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            <span>Script</span>
            <span>Voice</span>
            <span>Duration</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
          {filtered.map((item) => {
            const tone = statusTone(item.status);
            const done = item.status === "completed" && !!item.wav_url;
            return (
              <div
                key={item.id}
                className="grid grid-cols-1 gap-2 border-b border-border px-4 py-3.5 last:border-0 hover:bg-canvas/60 md:grid-cols-[1fr_140px_90px_130px_170px] md:items-center md:gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {truncate(item.text || item.text_preview, 90)}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {formatDate(item.created_at)} · {item.model || "Voira"}
                  </p>
                  {item.error && (
                    <p className="mt-1 text-[11px] text-destructive">{item.error}</p>
                  )}
                </div>

                <div className="text-sm text-muted-foreground">{item.voice_name}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {formatDuration(item.duration_s)}
                </div>

                <div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium ${tone.bg} ${tone.text}`}
                  >
                    <span className={`size-1.5 rounded-full ${tone.dot}`} />
                    {item.status}
                  </span>
                </div>

                <div className="flex items-center justify-start gap-1.5 md:justify-end">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="rounded-[8px]"
                    disabled={!done}
                    onClick={() => togglePlay(item)}
                    title={done ? "Play" : "Unavailable"}
                  >
                    {playingId === item.id ? (
                      <Square className="size-3.5" fill="currentColor" />
                    ) : (
                      <Play className="size-3.5" fill="currentColor" />
                    )}
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="rounded-[8px]"
                    disabled={!item.wav_url}
                    onClick={() =>
                      item.wav_url &&
                      download(
                        absoluteUrl(item.wav_url),
                        `voice-studio-${item.id.slice(0, 8)}.wav`
                      )
                    }
                    title="Download WAV"
                  >
                    <Download className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="rounded-[8px]"
                    disabled={!item.mp3_url}
                    onClick={() =>
                      item.mp3_url &&
                      download(
                        absoluteUrl(item.mp3_url),
                        `voice-studio-${item.id.slice(0, 8)}.mp3`
                      )
                    }
                    title="Download MP3"
                  >
                    <span className="text-[9px] font-semibold">MP3</span>
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="rounded-[8px] text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleting(item)}
                    title="Delete"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3" />
          {filtered.length} of {items.length} generations
        </p>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this generation?</AlertDialogTitle>
            <AlertDialogDescription>
              The audio files and this history entry will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={doDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
