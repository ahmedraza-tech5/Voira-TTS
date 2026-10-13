"use client";

import { useMemo, useState } from "react";
import { HelpCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type QA = { q: string; a: string };

const FAQ_DATA: { category: string; items: QA[] }[] = [
  {
    category: "Getting started",
    items: [
      {
        q: "What is Voice Studio?",
        a: "A self-hosted voice production studio powered by Voira, an ultra-realistic text-to-speech model. You write a script in the Studio, pick a voice, and the FastAPI backend synthesizes real audio with the Voira checkpoint and streams it back for playback and download.",
      },
      {
        q: "Which model is running?",
        a: "The backend reports its active checkpoint in the header status pill and on the Settings page. Supported presets are Voira English (500M), Voira Multilingual (23+ languages, V2/V3), Voira Turbo (350M, low-latency English) and Voira Nano (110M, CPU-friendly English), selected with the CB_MODEL environment variable.",
      },
      {
        q: "Do I need an account?",
        a: "No. This is a fully self-hosted app — there is no sign-up, no usage metering and no third-party API. All generation happens on your own backend.",
      },
    ],
  },
  {
    category: "Voice generation",
    items: [
      {
        q: "How does generation work?",
        a: "Your script is split into sentence-aware chunks (default 420 characters). Each chunk is synthesized by Voira sequentially, progress is reported per chunk through the job API, and the pieces are concatenated with a short silence gap into a single 24 kHz WAV. Long scripts therefore run without exhausting memory.",
      },
      {
        q: "What do Exaggeration and CFG do?",
        a: "Exaggeration (0–1) controls the emotional intensity of the delivery and CFG scale (0–1) controls how strictly the model follows your prompt. Both are supported by the English and Multilingual checkpoints; Turbo and Nano ignore them, so the Studio disables those sliders automatically.",
      },
      {
        q: "What does Speed change?",
        a: "Speed (0.5×–2×) time-stretches the finished audio without changing pitch. It is applied after synthesis, so it works with every model.",
      },
      {
        q: "Why does the first generation take longer?",
        a: "The model is loaded lazily on the first request (or eagerly if CB_EAGER_LOAD=1). Loading a half-billion-parameter checkpoint can take 30–90 seconds on a CPU host; after that, jobs start within milliseconds.",
      },
      {
        q: "Can I cancel a generation?",
        a: "Yes. The Cancel button calls the job cancel endpoint; the worker stops between chunks, partial audio is discarded, and the history entry is marked cancelled. Chunks already inside the model cannot be interrupted mid-inference.",
      },
    ],
  },
  {
    category: "Voice cloning",
    items: [
      {
        q: "How does cloning work?",
        a: "Upload a 5–30 second reference clip of clean speech. Voira performs zero-shot cloning: at generation time it embeds the speaker characteristics from your clip and conditions synthesis on them. Nothing is trained or stored as a model — only the reference WAV is saved in your studio data directory.",
      },
      {
        q: "What are the reference clip requirements?",
        a: "At least 5.5 seconds of clear, single-speaker speech (Turbo/Nano hard-require more than 5 seconds), up to 30 seconds (longer uploads are trimmed automatically). WAV, MP3, M4A, FLAC, OGG, AAC, MP4 and WebM audio are accepted, max 50 MB. Avoid background music, overlapping speakers and heavy noise.",
      },
      {
        q: "Do I need permission to clone a voice?",
        a: "Yes. You must confirm you have explicit consent — the voice is your own or the speaker has approved the clone. Cloning someone's voice without permission may be illegal in your jurisdiction; the consent checkbox is required before any upload is accepted.",
      },
      {
        q: "Can I preview and delete cloned voices?",
        a: "Yes. Generate a short sample on the Voice Cloning screen to store a preview, play it from the Voices library, and delete any cloned voice at any time — the stored reference clip is removed immediately.",
      },
    ],
  },
  {
    category: "Long scripts",
    items: [
      {
        q: "How long can my script be?",
        a: "Up to 6,000 characters by default (configurable with CB_MAX_TEXT). The character counter in the Studio shows the live limit for your deployment.",
      },
      {
        q: "Will a long script sound choppy between chunks?",
        a: "Chunks are split at sentence boundaries and joined with a 120 ms silence gap, which keeps natural pauses between sentences. For the smoothest results keep sentences under the chunk size so splits never fall mid-sentence.",
      },
      {
        q: "What happens if generation fails halfway?",
        a: "The job is marked failed with a safe error message, no partial audio is served, and the history entry records the failure so you can retry with a shorter script or different settings.",
      },
    ],
  },
  {
    category: "Downloads",
    items: [
      {
        q: "Which formats can I download?",
        a: "Every generation is written as a 16-bit PCM WAV. When ffmpeg is installed on the backend, an MP3 (128 kbps) is produced too and the MP3 button appears — the Settings page shows whether MP3 conversion is enabled.",
      },
      {
        q: "Audio downloads open in a new tab instead of saving — why?",
        a: "That happens when the browser blocks cross-origin downloads. The Studio fetches the file and saves it via a blob URL, but direct links (like in History) rely on the browser honoring the download attribute. The backend serves audio with CORS and byte-range support, so streaming and seeking always work.",
      },
    ],
  },
  {
    category: "Privacy",
    items: [
      {
        q: "Where do my scripts and voices live?",
        a: "In the backend's data directory: generations in data/generations/, cloned references in data/voices/, and a local data/history.json index. There is no database and no cloud storage — point CB_DATA_DIR at a persistent volume in production.",
      },
      {
        q: "Is any text or audio sent to a third party?",
        a: "No. The Next.js frontend only talks to your FastAPI backend over REST, and the backend runs the Voira model locally. The only outbound network calls are the one-time Hugging Face checkpoint download (and only if the weights are not cached) plus an optional HF_TOKEN.",
      },
      {
        q: "Is generated audio watermarked?",
        a: "Voira applies the Perth implicit watermarker to synthesized audio as part of the official model pipeline.",
      },
    ],
  },
  {
    category: "Errors and troubleshooting",
    items: [
      {
        q: "The header says 'Backend offline'. What do I do?",
        a: "The frontend cannot reach the FastAPI server. Confirm the backend is running (uvicorn app.main:app), that NEXT_PUBLIC_API_URL points at it, and that CORS origins (CB_CORS_ORIGINS) include your frontend URL.",
      },
      {
        q: "Jobs fail with 'Model unavailable'.",
        a: "The checkpoint failed to load — usually insufficient RAM/VRAM, no disk space for the Hugging Face download, or a network error. Check the backend logs and the Settings page for the exact engine error, then free resources or pick a smaller checkpoint (CB_MODEL=nano).",
      },
      {
        q: "Generation is extremely slow.",
        a: "CPU-only inference is expected to be slow for the 500M checkpoints — a minute or more per chunk on small hosts. Use CB_DEVICE=cuda on a GPU server, or CB_MODEL=nano for CPU deployments. Concurrent jobs are capped (CB_MAX_CONCURRENT=1 by default) to protect memory.",
      },
      {
        q: "Voice upload says 'too short'.",
        a: "Reference clips must be at least 5.5 seconds of speech for all checkpoints (Turbo/Nano require more than 5 seconds internally). Trim silence from the start or record a longer sample.",
      },
    ],
  },
];

export default function FaqPage() {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ_DATA;
    return FAQ_DATA.map((g) => ({
      category: g.category,
      items: g.items.filter(
        (i) => i.q.toLowerCase().includes(q) || i.a.toLowerCase().includes(q)
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  const total = FAQ_DATA.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search FAQs…"
          className="h-10 rounded-[10px] bg-card pl-9 text-sm"
        />
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[16px] border border-dashed border-border bg-card px-6 py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-brand-soft text-brand">
            <HelpCircle className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium">No answers match “{query}”</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try a shorter keyword, like “wav”, “consent” or “slow”.
            </p>
          </div>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.category} className="soft-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-canvas/60 px-5 py-3">
              <h2 className="text-sm font-semibold">{group.category}</h2>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {group.items.length}
              </Badge>
            </div>
            <Accordion className="px-5 pb-2">
              {group.items.map((item, idx) => (
                <AccordionItem key={idx} value={`${group.category}-${idx}`} className="border-border">
                  <AccordionTrigger className="py-3.5 text-sm font-medium hover:no-underline">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ))
      )}

      {!query && (
        <p className="text-center text-xs text-muted-foreground">
          {total} answers · based on this app&rsquo;s implemented features and the official
          Voira documentation
        </p>
      )}
    </div>
  );
}
