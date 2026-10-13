"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  Check,
  Loader2,
  Mic,
  Play,
  Search,
  Sparkles,
  Square,
  Trash2,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { api, absoluteUrl, ApiError } from "@/lib/api";
import type { Voice } from "@/lib/types";
import { formatDate, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>("builtin");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [deleting, setDeleting] = useState<Voice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const v = await api.voices();
      setVoices(v);
      const saved = localStorage.getItem("vs_voice");
      if (saved && v.some((x) => x.id === saved)) setSelected(saved);
      else if (v[0]) setSelected((prev) => (v.some((x) => x.id === prev) ? prev : v[0].id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load voices.");
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return voices;
    return voices.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.kind.includes(q)
    );
  }, [voices, query]);

  const togglePreview = (v: Voice) => {
    if (!v.preview_url) return;
    audio?.pause();
    if (playingId === v.id) {
      setPlayingId(null);
      return;
    }
    const el = new Audio(absoluteUrl(v.preview_url));
    el.onended = () => setPlayingId(null);
    void el.play().catch(() => setPlayingId(null));
    setAudio(el);
    setPlayingId(v.id);
  };

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await api.deleteVoice(deleting.id);
      setDeleting(null);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed.");
      setDeleting(null);
    }
  };

  const choose = (v: Voice) => {
    setSelected(v.id);
    localStorage.setItem("vs_voice", v.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search voices…"
            className="h-9 rounded-[10px] bg-card pl-9"
          />
        </div>
        <Button
          render={<Link href="/cloning" />}
          variant="outline"
          className="h-9 rounded-[10px] gap-1.5 text-sm"
        >
          <Mic className="size-4" />
          Clone a new voice
        </Button>
      </div>

      {error && (
        <p className="rounded-[10px] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-[16px] bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[16px] border border-dashed border-border bg-card px-6 py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-brand-soft text-brand">
            <AudioLines className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium">No voices match “{query}”</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try a different search, or clone your own voice.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => {
            const isSelected = selected === v.id;
            return (
              <Card
                key={v.id}
                className={cn(
                  "soft-card group relative overflow-hidden transition-all duration-150",
                  isSelected && "border-brand/50 ring-3 ring-brand/15"
                )}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-[12px]",
                        v.kind === "builtin"
                          ? "bg-brand-soft text-brand"
                          : v.kind === "preset"
                            ? "bg-amber-50 text-amber-600"
                            : "bg-emerald-50 text-emerald-600"
                      )}
                    >
                      {v.kind === "builtin" ? (
                        <Volume2 className="size-5" />
                      ) : v.kind === "preset" ? (
                        <Sparkles className="size-5" />
                      ) : (
                        <Mic className="size-5" />
                      )}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-medium",
                        v.kind === "builtin"
                          ? "border-brand/20 bg-brand-soft/60 text-brand"
                          : v.kind === "preset"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      )}
                    >
                      {v.kind === "builtin" ? "Built-in" : v.kind === "preset" ? "Studio" : "Cloned"}
                    </Badge>
                  </div>

                  <div className="mt-3.5">
                    <p className="truncate text-[15px] font-semibold">{v.name}</p>
                    <p className="mt-1 line-clamp-2 min-h-9 text-xs leading-relaxed text-muted-foreground">
                      {v.description ||
                        (v.kind === "builtin"
                          ? "The stock voice bundled with the Voira checkpoint."
                          : v.kind === "preset"
                            ? "Ultra-realistic studio voice, ready to use."
                            : "Cloned from your uploaded reference clip.")}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
                    {v.duration_s != null && <span>ref {formatDuration(v.duration_s)}</span>}
                    {v.created_at != null && <span>{formatDate(v.created_at)}</span>}
                    {!v.duration_s && v.created_at == null && <span>model default</span>}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={isSelected ? "secondary" : "outline"}
                      className="h-8 flex-1 rounded-[9px] text-xs font-medium"
                      onClick={() => choose(v)}
                      disabled={isSelected}
                    >
                      {isSelected ? (
                        <>
                          <Check className="size-3.5" /> Selected
                        </>
                      ) : (
                        "Use in Studio"
                      )}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="outline"
                      className="rounded-[9px]"
                      disabled={!v.preview_url}
                      onClick={() => togglePreview(v)}
                      title={v.preview_url ? "Play preview" : "Generate a preview in Voice Cloning first"}
                    >
                      {playingId === v.id ? (
                        <Square className="size-3.5" fill="currentColor" />
                      ) : (
                        <Play className="size-3.5" fill="currentColor" />
                      )}
                    </Button>
                    {v.kind === "cloned" && (
                      <Button
                        size="icon-sm"
                        variant="outline"
                        className="rounded-[9px] text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleting(v)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The stored reference clip will be permanently removed. Generations you
              already made with this voice are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={doDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete voice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {loading === false && voices.length > 1 && (
        <p className="text-xs text-muted-foreground">
          <Loader2 className="mr-1 inline size-3" />
          {voices.length} voices available · selection syncs with the Studio
        </p>
      )}
    </div>
  );
}
