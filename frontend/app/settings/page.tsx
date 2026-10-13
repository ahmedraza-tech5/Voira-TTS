"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Cpu,
  ExternalLink,
  FileDown,
  Gauge,
  Loader2,
  RefreshCw,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { api, API_BASE, ApiError } from "@/lib/api";
import type { Health, PublicConfig } from "@/lib/types";
import { cn } from "@/lib/utils";

function Row({
  label,
  value,
  mono = true,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "ok" | "warn" | "bad";
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "truncate text-right text-sm font-medium",
          mono && "font-mono text-xs",
          tone === "ok" && "text-success",
          tone === "warn" && "text-amber-600",
          tone === "bad" && "text-destructive"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = async (showErrors = true) => {
    setBusy(true);
    try {
      const [h, c] = await Promise.all([api.health(), api.config()]);
      setHealth(h);
      setConfig(c);
      setError(null);
    } catch (e) {
      if (showErrors) setError(e instanceof ApiError ? e.message : "Health check failed.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh(false);
    const id = setInterval(() => void refresh(false), 10000);
    return () => clearInterval(id);
  }, []);

  const loadModel = async () => {
    setLoadingModel(true);
    try {
      await api.loadEngine();
      setTimeout(() => void refresh(), 1500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not trigger model load.");
    } finally {
      setLoadingModel(false);
    }
  };

  const engine = health?.engine;
  const stateTone =
    engine?.state === "ready" ? "ok" : engine?.state === "error" ? "bad" : "warn";

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <Card className="soft-card border-0 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
            <Server className="size-4 text-brand" />
            Backend connection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Row label="API base URL" value={API_BASE} />
          <Separator />
          <Row
            label="Health"
            value={
              health
                ? health.status === "ok"
                  ? "ok"
                  : health.status
                : error
                  ? "unreachable"
                  : "checking…"
            }
            tone={health?.status === "ok" ? "ok" : error ? "bad" : "warn"}
          />
          <Separator />
          <Row label="API version" value={health?.version ?? "—"} />
          <Separator />
          <Row
            label="MP3 conversion"
            value={config ? (config.mp3_enabled ? "available (ffmpeg)" : "not available") : "—"}
            tone={config ? (config.mp3_enabled ? "ok" : "warn") : undefined}
          />

          {error && (
            <p className="mt-3 rounded-[10px] border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-[9px] gap-1.5 text-xs"
              onClick={() => refresh()}
              disabled={busy}
            >
              <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
              Refresh
            </Button>
            <Button
              size="sm"
              className="h-8 rounded-[9px] gap-1.5 text-xs"
              onClick={loadModel}
              disabled={loadingModel || engine?.state === "ready"}
            >
              {loadingModel ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Loading…
                </>
              ) : (
                <>
                  <Activity className="size-3.5" /> Load model now
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="soft-card border-0 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
            <Cpu className="size-4 text-brand" />
            Model status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Row label="Checkpoint" value={engine?.model_label ?? config?.model_label ?? "—"} />
          <Separator />
          <Row
            label="State"
            value={engine?.state ?? "—"}
            tone={stateTone}
          />
          <Separator />
          <Row label="Device" value={engine?.device ?? "—"} />
          <Separator />
          <Row
            label="Sample rate"
            value={engine?.sample_rate ? `${engine.sample_rate} Hz` : "not loaded"}
          />
          <Separator />
          <Row
            label="Reference required"
            value={engine?.requires_reference ? "yes (clone a voice first)" : "no"}
            tone={engine?.requires_reference ? "warn" : "ok"}
          />
          {engine?.error && (
            <p className="mt-3 rounded-[10px] border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs leading-relaxed text-destructive">
              {engine.error}
            </p>
          )}
          {!engine?.error && engine?.state !== "ready" && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              The model loads lazily on the first generation (or immediately if
              CB_EAGER_LOAD=1). First load downloads the checkpoint from Hugging Face and
              can take a minute or two.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="soft-card border-0 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
            <Gauge className="size-4 text-brand" />
            Limits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Row
            label="Max script length"
            value={config ? `${config.max_text_length.toLocaleString()} chars` : "—"}
          />
          <Separator />
          <Row label="Chunk size" value={config ? `${config.chunk_max_chars} chars` : "—"} />
          <Separator />
          <Row
            label="Languages"
            value={
              config && config.languages.length > 0
                ? `${config.languages.length} supported`
                : "English only"
            }
          />
          <Separator />
          <Row
            label="Generation speed"
            value={config?.default_params ? `temp ${config.default_params.temperature}` : "—"}
          />
        </CardContent>
      </Card>

      <Card className="soft-card border-0 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
            <FileDown className="size-4 text-brand" />
            About this deployment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Voice Studio runs a Next.js frontend (Vercel-friendly) against a separate
            FastAPI backend that hosts the official{" "}
            <a
              href="https://github.com/resemble-ai/chatterbox"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
            >
              Voira TTS
              <ExternalLink className="size-3" />
            </a>{" "}
            model. All audio is generated and stored on your own server.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="secondary" className="font-mono text-[10px]">
              REST API
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px]">
              no database
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px]">
              WAV + MP3
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px]">
              local storage
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
