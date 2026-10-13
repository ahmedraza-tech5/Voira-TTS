"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  Loader2,
  Mic,
  Play,
  ShieldCheck,
  Square,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { api, absoluteUrl, ApiError, downloadFile } from "@/lib/api";
import type { Job, Voice } from "@/lib/types";
import { pollJob } from "@/lib/poll";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const ACCEPTED = [".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac", ".mp4", ".webm"];
const MAX_MB = 50;

export default function CloningPage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // sample generation
  const [testVoice, setTestVoice] = useState<string | null>(null);
  const [testText, setTestText] = useState(
    "Hey! This is a quick sample so you can hear how the cloned voice sounds."
  );
  const [job, setJob] = useState<Job | null>(null);
  const [sampling, setSampling] = useState(false);
  const stopPollRef = useRef<(() => void) | null>(null);

  const refresh = async () => {
    try {
      const v = await api.voices();
      setVoices(v.filter((x) => x.kind === "cloned"));
    } catch {
      /* status pill shows connection state */
    }
  };

  useEffect(() => {
    void refresh();
    return () => {
      stopPollRef.current?.();
    };
  }, []);

  const validateFile = useCallback((f: File) => {
    const ext = `.${f.name.split(".").pop()?.toLowerCase() ?? ""}`;
    if (!ACCEPTED.includes(ext)) {
      return `Unsupported file type ${ext}. Use ${ACCEPTED.join(", ")}.`;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      return `File is ${(f.size / 1e6).toFixed(0)} MB — maximum is ${MAX_MB} MB.`;
    }
    return null;
  }, []);

  const probeDuration = useCallback((f: File) => {
    const url = URL.createObjectURL(f);
    const el = new Audio();
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      setFileDuration(Number.isFinite(el.duration) ? el.duration : null);
      URL.revokeObjectURL(url);
    };
    el.onerror = () => {
      setFileDuration(null);
      URL.revokeObjectURL(url);
    };
    el.src = url;
  }, []);

  const pickFile = useCallback(
    (f: File | null | undefined) => {
      if (!f) return;
      const err = validateFile(f);
      if (err) {
        setError(err);
        setFile(null);
        return;
      }
      setError(null);
      setSuccess(null);
      setFile(f);
      probeDuration(f);
    },
    [validateFile, probeDuration]
  );

  const submit = async () => {
    setError(null);
    setSuccess(null);
    if (!file) return setError("Choose a reference audio file first.");
    if (!name.trim()) return setError("Give the voice a name.");
    if (!consent)
      return setError("You must confirm you have permission to clone this voice.");

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("name", name.trim());
      form.append("description", description.trim());
      form.append("consent", "true");
      const created = await api.createVoice(form);
      setSuccess(`Voice “${created.name}” created — you can test it below.`);
      setFile(null);
      setFileDuration(null);
      setName("");
      setDescription("");
      setConsent(false);
      if (inputRef.current) inputRef.current.value = "";
      await refresh();
      setTestVoice(created.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const stopPoll = () => {
    stopPollRef.current?.();
    stopPollRef.current = null;
  };

  const generateSample = async () => {
    if (!testVoice) return;
    setSampling(true);
    setError(null);
    try {
      const j = await api.generate({
        text: testText.trim(),
        voice_id: testVoice,
        exaggeration: 0.5,
        cfg_weight: 0.5,
        temperature: 0.8,
        speed: 1,
      });
      setJob(j);
      stopPoll();
      stopPollRef.current = pollJob(j.id, ({ job: cur, done }) => {
        setJob(cur);
        if (done) {
          stopPollRef.current = null;
          setSampling(false);
          if (cur.status === "failed") setError(cur.error ?? "Sample generation failed.");
          // first successful sample becomes the library preview — refresh so it shows up
          if (cur.status === "completed") void refresh();
        }
      });
    } catch (e) {
      setSampling(false);
      setError(e instanceof ApiError ? e.message : "Could not start sample generation.");
    }
  };

  const cancelSample = async () => {
    if (!job) return;
    try {
      const j = await api.cancelJob(job.id);
      setJob(j);
      if (["completed", "failed", "cancelled"].includes(j.status)) {
        stopPoll();
        setSampling(false);
      }
    } catch {
      /* job may have finished already */
    }
  };

  const removeVoice = async (v: Voice) => {
    try {
      await api.deleteVoice(v.id);
      if (testVoice === v.id) {
        setTestVoice(null);
        setJob(null);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed.");
    }
  };

  const busy = sampling || job?.status === "queued" || job?.status === "processing";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ---- Upload / create ---- */}
      <Card className="soft-card border-0 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-[15px] font-semibold">
            New cloned voice
            <span className="flex items-center gap-1.5 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand">
              <ShieldCheck className="size-3" />
              consent required
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[14px] border-2 border-dashed px-6 py-10 text-center transition-colors duration-150",
              dragging
                ? "border-brand bg-brand-soft/60"
                : "border-border bg-canvas/60 hover:border-brand/40 hover:bg-brand-soft/30"
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED.join(",")}
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <span className="flex size-11 items-center justify-center rounded-full bg-brand-soft text-brand">
              <UploadCloud className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium">
                {file ? file.name : "Drop a reference clip here"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {file
                  ? `${(file.size / 1e6).toFixed(1)} MB${fileDuration != null ? ` · ${formatDuration(fileDuration)}` : ""}`
                  : `WAV, MP3, M4A, FLAC, OGG — up to ${MAX_MB} MB, 5–30 seconds of clean speech`}
              </p>
            </div>
            {file && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  setFileDuration(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                <X className="size-3.5" /> Remove
              </Button>
            )}
          </div>

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="voice-name" className="text-[13px] font-medium">
                Voice name
              </Label>
              <Input
                id="voice-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My Narrator"
                maxLength={60}
                className="h-9 rounded-[10px] bg-card"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voice-desc" className="text-[13px] font-medium">
                Description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="voice-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Warm, mid-range voice for product videos"
                maxLength={300}
                className="h-9 rounded-[10px] bg-card"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-border bg-canvas/60 p-3.5">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
              className="mt-0.5"
            />
            <span className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">I have permission to clone this voice.</span>{" "}
              I confirm this recording is my own voice, or I have explicit consent from
              the person speaking to create a synthetic clone. Voira clones from a
              short reference clip — it does not train or store a new model of the person.
            </span>
          </label>

          {error && (
            <Alert variant="destructive" className="rounded-[12px] border-destructive/20 bg-destructive/5">
              <AlertTriangle className="size-4" />
              <AlertTitle className="text-sm">Could not create voice</AlertTitle>
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert className="rounded-[12px] border-success/20 bg-success/5 text-success [&>svg]:text-success">
              <Check className="size-4" />
              <AlertTitle className="text-sm">Voice created</AlertTitle>
              <AlertDescription className="text-xs text-success/90">{success}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={submit}
            disabled={uploading || !file || !name.trim() || !consent}
            className="h-10 w-full rounded-[10px] text-sm font-semibold"
          >
            {uploading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <Mic className="size-4" /> Create voice
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ---- Test / manage ---- */}
      <div className="space-y-6">
        <Card className="soft-card border-0 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-semibold">Test a cloned voice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {voices.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-[12px] border border-dashed border-border bg-canvas/50 px-4 py-8 text-center">
                <ClipboardCheck className="size-5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  No cloned voices yet — upload a reference clip on the left.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {voices.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setTestVoice(v.id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        testVoice === v.id
                          ? "border-brand bg-brand-soft text-brand"
                          : "border-border bg-card text-muted-foreground hover:border-brand/40"
                      )}
                    >
                      {v.name}
                    </button>
                  ))}
                  {voices.map(
                    (v) =>
                      v.id === testVoice && (
                        <button
                          key={`${v.id}-del`}
                          onClick={() => removeVoice(v)}
                          className="rounded-full border border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive"
                          title="Delete voice"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )
                  )}
                </div>

                <Textarea
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  placeholder="Text for the test generation…"
                  className="min-h-[96px] rounded-[12px] bg-canvas/60 text-sm"
                  maxLength={1000}
                />

                <div className="flex items-center gap-2">
                  <Button
                    onClick={generateSample}
                    disabled={busy || !testVoice || !testText.trim()}
                    className="h-9 rounded-[10px] gap-1.5 text-sm font-medium"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="size-4 animate-spin" /> Generating sample…
                      </>
                    ) : (
                      <>
                        <Play className="size-4" fill="currentColor" /> Generate sample
                      </>
                    )}
                  </Button>
                  {busy && job && (
                    <>
                      <Button
                        variant="outline"
                        onClick={cancelSample}
                        className="h-9 rounded-[10px] text-sm"
                      >
                        Cancel
                      </Button>
                      <span className="font-mono text-xs text-muted-foreground">
                        {Math.round(job.progress * 100)}%
                      </span>
                    </>
                  )}
                </div>

                {job?.status === "completed" && job.audio && (
                  <div className="rounded-[12px] border border-success/20 bg-success/5 p-3">
                    <audio
                      controls
                      src={absoluteUrl(job.audio.url)}
                      className="w-full"
                      preload="none"
                    />
                    <p className="mt-2 flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
                      <span>{formatDuration(job.audio.duration_s)}</span>
                      <button
                        type="button"
                        className="underline underline-offset-2 hover:text-brand"
                        onClick={() =>
                          void downloadFile(
                            absoluteUrl(job.audio!.url),
                            `sample-${job.id.slice(0, 8)}.wav`
                          )
                        }
                      >
                        download wav
                      </button>
                      {job.audio.mp3_url && (
                        <button
                          type="button"
                          className="underline underline-offset-2 hover:text-brand"
                          onClick={() =>
                            void downloadFile(
                              absoluteUrl(job.audio!.mp3_url!),
                              `sample-${job.id.slice(0, 8)}.mp3`
                            )
                          }
                        >
                          download mp3
                        </button>
                      )}
                    </p>
                  </div>
                )}
                {job?.status === "failed" && (
                  <p className="text-xs text-destructive">{job.error}</p>
                )}
                {job?.status === "cancelled" && (
                  <p className="text-xs text-muted-foreground">Sample generation cancelled.</p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="soft-card border-0 shadow-none">
          <CardContent className="flex items-start gap-3 p-4">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
              <ShieldCheck className="size-3.5" />
            </span>
            <div className="text-xs leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground">Privacy</p>
              Reference clips stay on your own backend in the studio data directory —
              nothing is uploaded to a third party. Voira performs zero-shot cloning
              from the clip at generation time; no model is trained from your upload.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
