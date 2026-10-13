"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  FileAudio,
  Loader2,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { api, absoluteUrl, ApiError } from "@/lib/api";
import type { Health, Job, PublicConfig, Voice } from "@/lib/types";
import { pollJob } from "@/lib/poll";
import { AudioPlayer } from "@/components/audio-player";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

function ParamSlider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
  format,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  format?: (v: number) => string;
}) {
  return (
    <div className={cn("space-y-2", disabled && "opacity-50")}>
      <div className="flex items-baseline justify-between">
        <Label className="text-[13px] font-medium">{label}</Label>
        <span className="font-mono text-xs text-muted-foreground">
          {format ? format(value) : value.toFixed(2)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
      <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function StudioPage() {
  const [text, setText] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [languageId, setLanguageId] = useState("en");
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [health, setHealth] = useState<Health | null>(null);

  const [exaggeration, setExaggeration] = useState(0.5);
  const [cfg, setCfg] = useState(0.5);
  const [temperature, setTemperature] = useState(0.8);
  const [speed, setSpeed] = useState(1);

  const [job, setJob] = useState<Job | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const stopPollRef = useRef<(() => void) | null>(null);

  const maxChars = config?.max_text_length ?? 6000;
  const busy = submitting || job?.status === "queued" || job?.status === "processing";
  const noVoices = voices.length === 0;
  const backendDown = backendError !== null;

  // Bootstrap data
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cfgRes, voicesRes, healthRes] = await Promise.allSettled([
          api.config(),
          api.voices(),
          api.health(),
        ]);
        if (!alive) return;
        if (cfgRes.status === "fulfilled") {
          setConfig(cfgRes.value);
          setExaggeration(cfgRes.value.default_params.exaggeration);
          setCfg(cfgRes.value.default_params.cfg_weight);
          setTemperature(cfgRes.value.default_params.temperature);
        }
        if (voicesRes.status === "fulfilled") {
          setVoices(voicesRes.value);
          setBackendError(null);
          const saved =
            typeof window !== "undefined" ? localStorage.getItem("vs_voice") : null;
          const match = voicesRes.value.find((v) => v.id === saved);
          setVoiceId(match?.id ?? voicesRes.value[0]?.id ?? "builtin");
        } else {
          const reason: unknown = voicesRes.reason;
          setBackendError(
            reason instanceof ApiError
              ? reason.message
              : "Failed to load voices from the backend.",
          );
        }
        if (healthRes.status === "fulfilled") setHealth(healthRes.value);
      } catch {
        /* handled by status pill */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const stopPolling = useCallback(() => {
    stopPollRef.current?.();
    stopPollRef.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      stopPollRef.current = pollJob(jobId, ({ job: j, done }) => {
        setJob(j);
        if (done) {
          stopPollRef.current = null;
          setSubmitting(false);
          if (j.status === "failed") setError(j.error ?? "Generation failed.");
        }
      });
    },
    [stopPolling]
  );

  const generate = useCallback(async () => {
    setError(null);
    if (!text.trim()) {
      setError("Write something first — the script is empty.");
      return;
    }
    if (text.length > maxChars) {
      setError(`Script is ${text.length} characters. Limit is ${maxChars}.`);
      return;
    }
    if (!voiceId) {
      setError("Select a voice.");
      return;
    }
    setSubmitting(true);
    setJob(null);
    try {
      const j = await api.generate({
        text: text.trim(),
        voice_id: voiceId,
        language_id:
          config && config.languages.length > 0 ? languageId : undefined,
        exaggeration,
        cfg_weight: cfg,
        temperature,
        speed,
      });
      setJob(j);
      startPolling(j.id);
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof ApiError ? e.message : "Could not start generation.");
    }
  }, [text, voiceId, config, languageId, exaggeration, cfg, temperature, speed, maxChars, startPolling]);

  const cancel = useCallback(async () => {
    if (!job) return;
    try {
      const j = await api.cancelJob(job.id);
      setJob(j);
      if (["completed", "failed", "cancelled"].includes(j.status)) {
        stopPolling();
        setSubmitting(false);
      }
    } catch {
      /* job may have finished already */
    }
  }, [job, stopPolling]);

  const regenerate = useCallback(() => {
    void generate();
  }, [generate]);

  const copyScript = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }, [text]);

  const supportsExaggeration = health?.engine.supports_exaggeration ?? true;
  const languages = useMemo(
    () => (config?.languages?.length ? config.languages : health?.engine.languages ?? []),
    [config, health]
  );

  const activeVoice = voices.find((v) => v.id === voiceId);
  const engineReady = health?.engine.state === "ready";
  const engineError = health?.engine.state === "error";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
      {/* ---------- Left: script + settings ---------- */}
      <div className="space-y-6">
        <Card className="soft-card border-0 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px] font-semibold">Script</CardTitle>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    text.length > maxChars ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {text.length.toLocaleString()} / {maxChars.toLocaleString()}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs text-muted-foreground"
                  onClick={copyScript}
                  disabled={!text}
                >
                  {copied ? <Check className="size-3.5 text-success" /> : <ClipboardCopy className="size-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {backendDown && (
              <Alert
                variant="destructive"
                className="rounded-[12px] border-destructive/25 bg-destructive/5"
              >
                <AlertTriangle className="size-4" />
                <AlertTitle className="text-[13px] font-semibold">
                  TTS backend is not reachable
                </AlertTitle>
                <AlertDescription className="text-xs leading-relaxed">
                  {backendError} Start it with{" "}
                  <code className="rounded bg-destructive/10 px-1 py-0.5 font-mono">
                    bash backend/start.sh
                  </code>{" "}
                  (port 8000), then reload this page. Your voices are safe on disk — they
                  only show up once the backend is running.
                </AlertDescription>
              </Alert>
            )}
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type or paste the text you want to turn into speech… e.g. Welcome to Voice Studio — write a script, choose a voice, and generate natural speech in seconds."
              className="min-h-[300px] resize-y rounded-[12px] border-input bg-canvas/60 p-4 text-[15px] leading-relaxed shadow-none focus-visible:ring-brand/20"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">Voice</Label>
                <Select
                  value={voiceId}
                  onValueChange={(v) => {
                    const id = String(v ?? "");
                    setVoiceId(id);
                    localStorage.setItem("vs_voice", id);
                  }}
                >
                  <SelectTrigger className="h-9 w-full bg-card">
                    <SelectValue placeholder="Select a voice" />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.length === 0 && (
                      <SelectItem value="__none" disabled>
                        {backendDown
                          ? "Backend offline — voices can't load"
                          : "No voices available"}
                      </SelectItem>
                    )}
                    {voices.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                        {v.kind === "builtin"
                          ? " · built-in"
                          : v.kind === "preset"
                            ? " · studio"
                            : " · cloned"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeVoice?.kind === "builtin" && (
                  <p className="text-xs text-muted-foreground">
                    The model&rsquo;s own voice — no reference clip needed.
                  </p>
                )}
                {activeVoice?.kind === "preset" && (
                  <p className="text-xs text-muted-foreground">
                    Studio voice · ultra-realistic · ref {formatDuration(activeVoice.duration_s ?? 0)}
                  </p>
                )}
                {activeVoice?.kind === "cloned" && (
                  <p className="text-xs text-muted-foreground">
                    Cloned voice · reference {formatDuration(activeVoice.duration_s ?? 0)}
                  </p>
                )}
              </div>

              {languages.length > 0 ? (
                <div className="space-y-2">
                  <Label className="text-[13px] font-medium">Language</Label>
                  <Select value={languageId} onValueChange={(v) => setLanguageId(String(v ?? "en"))}>
                    <SelectTrigger className="h-9 w-full bg-card">
                      <SelectValue placeholder="Language" />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-[13px] font-medium">Model</Label>
                  <div className="flex h-9 items-center gap-2 rounded-[10px] border border-input bg-card px-3 text-sm">
                    <Zap className="size-3.5 text-brand" />
                    <span className="truncate">{config?.model_label ?? "Voira"}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-[12px] border border-border bg-canvas/60 p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[13px] font-semibold">Generation settings</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground"
                  onClick={() => {
                    setExaggeration(0.5);
                    setCfg(0.5);
                    setTemperature(0.8);
                    setSpeed(1);
                  }}
                >
                  Reset
                </Button>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <ParamSlider
                  label="Speed"
                  hint="Time-stretch the final audio without changing pitch."
                  value={speed}
                  min={0.5}
                  max={2}
                  step={0.05}
                  onChange={setSpeed}
                  format={(v) => `${v.toFixed(2)}×`}
                />
                <ParamSlider
                  label="Temperature"
                  hint="Higher = more varied delivery, lower = more consistent."
                  value={temperature}
                  min={0.05}
                  max={1.5}
                  step={0.05}
                  onChange={setTemperature}
                />
                <ParamSlider
                  label="Exaggeration"
                  hint="Emotional intensity of the delivery."
                  value={exaggeration}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={setExaggeration}
                  disabled={!supportsExaggeration}
                />
                <ParamSlider
                  label="CFG scale"
                  hint="How closely the model follows the prompt (0 = off)."
                  value={cfg}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={setCfg}
                  disabled={!supportsExaggeration}
                />
              </div>
              {!supportsExaggeration && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Exaggeration and CFG only apply to the English &amp; Multilingual
                  Voira checkpoints.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={generate}
                disabled={busy || !text.trim() || noVoices}
                className="h-10 gap-2 rounded-[10px] px-6 text-sm font-semibold shadow-[0_8px_20px_-10px_rgba(99,91,255,0.8)]"
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    Generate Speech
                  </>
                )}
              </Button>
              {busy && (
                <Button variant="outline" onClick={cancel} className="h-10 rounded-[10px] text-sm">
                  Cancel
                </Button>
              )}
              {noVoices && (
                <span className="text-xs text-muted-foreground">
                  {backendDown
                    ? "Backend offline — start it to load your voices."
                    : "No voices available — create a cloned voice first."}
                </span>
              )}
              {engineError && (
                <span className="text-xs text-destructive">Model failed to load — see Settings.</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---------- Right: result ---------- */}
      <div className="space-y-6">
        <Card className="soft-card border-0 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-[15px] font-semibold">
              Result
              {job && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    job.status === "completed" && "bg-success/10 text-success",
                    job.status === "failed" && "bg-destructive/10 text-destructive",
                    job.status === "cancelled" && "bg-muted text-muted-foreground",
                    (job.status === "processing" || job.status === "queued") &&
                      "bg-brand-soft text-brand"
                  )}
                >
                  {job.status}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive" className="rounded-[12px] border-destructive/20 bg-destructive/5">
                <AlertTriangle className="size-4" />
                <AlertTitle className="text-sm">Generation failed</AlertTitle>
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}

            {busy && job && (
              <div className="space-y-3 rounded-[12px] border border-border bg-canvas/60 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <Loader2 className="size-4 animate-spin text-brand" />
                    {job.status === "queued" ? "Waiting in queue…" : "Synthesizing speech…"}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {Math.round(job.progress * 100)}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand transition-[width] duration-300"
                    style={{ width: `${Math.max(4, job.progress * 100)}%` }}
                  />
                </div>
                {job.total_chunks > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Chunk {job.current_chunk} of {job.total_chunks}
                    {engineReady ? "" : " · loading model on first run, may take a minute"}
                  </p>
                )}
              </div>
            )}

            {!busy && job?.status === "completed" && job.audio && (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-[12px] border border-success/20 bg-success/5 px-3.5 py-2.5">
                  <span className="flex items-center gap-2 text-sm font-medium text-success">
                    <Check className="size-4" />
                    Audio ready
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDuration(job.audio.duration_s)} · {job.model || "Voira"}
                  </span>
                </div>
                <AudioPlayer
                  src={absoluteUrl(job.audio.url)}
                  mp3Src={job.audio.mp3_url ? absoluteUrl(job.audio.mp3_url) : null}
                  mp3Enabled={config?.mp3_enabled ?? false}
                  filenameBase={`voice-studio-${job.id.slice(0, 8)}`}
                  onRegenerate={regenerate}
                />
                <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  “{job.text_preview}”
                </p>
              </div>
            )}

            {!busy && !job && !error && (
              <div className="flex flex-col items-center justify-center gap-3 rounded-[12px] border border-dashed border-border bg-canvas/50 px-6 py-12 text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <FileAudio className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">No audio yet</p>
                  <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-muted-foreground">
                    Your generated speech will appear here with a real waveform, ready
                    to play and download.
                  </p>
                </div>
              </div>
            )}

            {job?.status === "cancelled" && !busy && (
              <div className="flex items-center gap-2 rounded-[12px] border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                <XCircle className="size-4" />
                Generation cancelled.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="soft-card border-0 shadow-none">
          <CardContent className="flex items-start gap-3 p-4">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
              <Zap className="size-3.5" />
            </span>
            <div className="text-xs leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground">How it works</p>
              Your script is split into sentence-aware chunks, synthesized one by one by
              Voira, then safely concatenated into a single WAV file — long scripts
              supported without exhausting memory.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
