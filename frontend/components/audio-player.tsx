"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import { downloadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  src: string;
  mp3Src?: string | null;
  filenameBase: string;
  mp3Enabled?: boolean;
  onRegenerate?: () => void;
  className?: string;
  height?: number;
};

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const BAR_COUNT = 96;

async function computePeaks(url: string, bars = BAR_COUNT): Promise<Float32Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const Ctx: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const block = Math.floor(data.length / bars);
    const peaks = new Float32Array(bars);
    for (let i = 0; i < bars; i++) {
      let max = 0;
      const start = i * block;
      for (let j = 0; j < block; j += Math.max(1, Math.floor(block / 64))) {
        const v = Math.abs(data[start + j] ?? 0);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    void ctx.close();
    return peaks;
  } catch {
    return null;
  }
}

export function AudioPlayer({
  src,
  mp3Src,
  filenameBase,
  mp3Enabled,
  onRegenerate,
  className,
  height = 72,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [waveState, setWaveState] = useState<"loading" | "ready" | "flat">("loading");
  const draggingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    setPeaks(null);
    setWaveState("loading");
    setPlaying(false);
    setCurrent(0);
    computePeaks(src).then((p) => {
      if (!alive) return;
      if (p) {
        setPeaks(p);
        setWaveState("ready");
      } else {
        setWaveState("flat");
      }
    });
    return () => {
      alive = false;
    };
  }, [src]);

  const onTimeUpdate = useCallback(() => {
    const el = audioRef.current;
    if (el && !draggingRef.current) setCurrent(el.currentTime);
  }, []);

  const seekTo = useCallback((ratio: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(el.duration)) return;
    const t = Math.max(0, Math.min(1, ratio)) * el.duration;
    el.currentTime = t;
    setCurrent(t);
  }, []);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = muted ? 0 : volume;
    el.playbackRate = speed;
  }, [volume, muted, speed]);

  const bars = useMemo(() => {
    if (!peaks) return null;
    const max = Math.max(...Array.from(peaks), 0.0001);
    return Array.from(peaks, (p) => Math.max(0.06, p / max));
  }, [peaks]);

  const progress = duration > 0 ? current / duration : 0;

  const handleWaveClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo((e.clientX - rect.left) / rect.width);
  };

  return (
    <div className={cn("rounded-[16px] border border-border bg-card p-4", className)}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <div className="flex items-center gap-3">
        <Button
          onClick={toggle}
          size="icon"
          className="size-10 shrink-0 rounded-full bg-brand text-white shadow-[0_6px_16px_-6px_rgba(99,91,255,0.7)] hover:bg-brand/90"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <Pause className="size-4" fill="currentColor" />
          ) : (
            <Play className="ml-0.5 size-4" fill="currentColor" />
          )}
        </Button>

        <div
          className="group relative min-w-0 flex-1 cursor-pointer select-none"
          style={{ height }}
          onClick={handleWaveClick}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={current}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") seekTo(progress + 0.05);
            if (e.key === "ArrowLeft") seekTo(progress - 0.05);
          }}
        >
          <div className="absolute inset-0 flex items-center gap-[2px] overflow-hidden">
            {(bars ?? Array.from({ length: BAR_COUNT }, () => 0.12)).map((v, i) => {
              const passed = i / BAR_COUNT <= progress;
              return (
                <div
                  key={i}
                  className={cn(
                    "min-w-[2px] flex-1 rounded-full transition-[background-color] duration-100",
                    waveState === "loading"
                      ? "animate-pulse bg-muted"
                      : passed
                        ? "bg-brand"
                        : "bg-slate-200 group-hover:bg-slate-300"
                  )}
                  style={{ height: `${Math.round(v * 100)}%` }}
                />
              );
            })}
          </div>
          {waveState === "loading" && (
            <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              Loading waveform…
            </span>
          )}
        </div>

        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {formatDuration(current)} / {formatDuration(duration)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </Button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              setMuted(false);
            }}
            className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-muted accent-brand"
            aria-label="Volume"
          />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-1 h-7 gap-1 px-2 text-xs font-medium text-muted-foreground"
                />
              }
            >
              {speed}×
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {SPEEDS.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={cn("font-mono text-xs", s === speed && "text-brand")}
                >
                  {s}× speed
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-1.5">
          {onRegenerate && (
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground" onClick={onRegenerate}>
              <RotateCcw className="size-3.5" />
              Regenerate
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void downloadFile(src, `${filenameBase}.wav`)}
          >
            <Download className="size-3.5" />
            WAV
          </Button>
          {mp3Enabled && mp3Src && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => void downloadFile(mp3Src, `${filenameBase}.mp3`)}
            >
              <Download className="size-3.5" />
              MP3
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
