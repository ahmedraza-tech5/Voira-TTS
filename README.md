# Voice Studio — AI Text-to-Speech (ElevenLabs-style)

A premium, self-hosted voice production studio built on the official
[Chatterbox TTS](https://github.com/resemble-ai/chatterbox) model.

```
User script ──▶ Next.js frontend (Vercel)
                    │  REST (JSON)
                    ▼
              FastAPI backend (Railway / GPU host)
                    │
                    ▼
              Chatterbox TTS model  ──▶  WAV / MP3 audio
                    │  job id + progress polling
                    ▼
              Frontend player (waveform, seek, download)
```

**No databases, no serverless inference, no fake audio.** Generation runs
sequentially on a persistent Python worker with sentence-aware chunking.

---

## Repository layout

```
tts/
├── chatterbox/     # official Chatterbox repository (engine, untouched)
├── backend/        # FastAPI app that hosts Chatterbox
│   ├── app/
│   │   ├── main.py         # REST routes, CORS, range-capable audio serving
│   │   ├── engine.py       # lazy model singleton (english/multilingual/turbo/nano)
│   │   ├── jobs.py         # job queue, real per-chunk progress, cancellation
│   │   ├── chunking.py     # sentence-aware long-script splitting
│   │   ├── audio_utils.py  # reference validation, WAV/MP3, speed stretch
│   │   └── storage.py      # JSON history + cloned voices (local files)
│   ├── requirements.txt
│   ├── .env.example
│   └── data/               # runtime: generations/, voices/, history.json
└── frontend/       # Next.js App Router + TypeScript + Tailwind + shadcn/ui
    ├── app/                # Studio, Voices, Cloning, History, FAQ, Settings
    ├── components/         # app shell, audio player (real waveform)
    └── .env.example
```

---

## Quick start (local)

### 1. Backend

```bash
cd backend
python3.12 -m venv .venv          # any Python 3.10–3.12 works
source .venv/bin/activate         # Windows: .venv\Scripts\activate
pip install -U pip
pip install -r requirements.txt
pip install --no-deps -e ../chatterbox
pip install "resemble-perth @ git+https://github.com/resemble-ai/Perth.git@master"

cp .env.example .env              # then edit CB_MODEL etc.
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- First start downloads the selected checkpoint from Hugging Face
  (~0.5–3 GB depending on `CB_MODEL`).
- API docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/api/health`

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local        # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                       # http://localhost:3000
```

Production: `npm run build && npm start`.

---

## Configuration

### Backend (`backend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `CB_MODEL` | `english` | `english` · `multilingual` · `turbo` · `nano` |
| `CB_DEVICE` | `auto` | `auto` · `cuda` · `cpu` · `mps` |
| `CB_MTL_T3` | `v3` | multilingual checkpoint `v2` / `v3` |
| `CB_EAGER_LOAD` | `0` | `1` = load model at startup |
| `CB_DATA_DIR` | `./data` | generations, voices, history (use a volume in prod) |
| `CB_MAX_TEXT` | `6000` | max script characters |
| `CB_CHUNK_MAX_CHARS` | `420` | sentence-chunk size |
| `CB_MAX_CONCURRENT` | `1` | parallel generation jobs (keep at 1 on small hosts) |
| `CB_MIN_REF_SECONDS` | `5.5` | minimum reference clip length |
| `CB_MAX_REF_SECONDS` | `30` | maximum reference clip length (trimmed) |
| `CB_CORS_ORIGINS` | `*` | allowed origins, comma separated |

Model cheat-sheet:

| `CB_MODEL` | Size | Languages | Needs reference clip | Exaggeration/CFG |
|---|---|---|---|---|
| `english` | ~3.2 GB | English | no (built-in voice) | yes |
| `multilingual` | ~6.5 GB | 23+ | no (built-in voice) | yes |
| `turbo` | ~2.2 GB | English | yes (>5 s) | ignored |
| `nano` | ~1.9 GB | English | no (built-in voice)¹ | ignored |

¹ The nano checkpoint ships `conds.pt`; when present, the built-in voice is
offered automatically. If a checkpoint has no built-in voice, the Studio
requires a cloned voice instead of inventing one.

### Frontend (`frontend/.env.local`)

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend base URL, e.g. `https://your-api.up.railway.app` |

---

## API overview

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | status + engine info (drives the header pill) |
| `GET` | `/api/config` | public limits, default params, languages |
| `POST` | `/api/engine/load` | trigger model load (cold starts) |
| `POST` | `/api/generate` | submit job → `{id, status, progress…}` |
| `GET` | `/api/jobs/{id}` | poll status/progress (700 ms in the UI) |
| `POST` | `/api/jobs/{id}/cancel` | cancel between chunks |
| `GET` | `/api/voices` | built-in + cloned voices |
| `POST` | `/api/voices` | multipart upload: file, name, description, consent |
| `DELETE` | `/api/voices/{id}` | delete a cloned voice + reference clip |
| `GET` | `/api/history` | generation history |
| `DELETE` | `/api/history/{id}` | delete entry + audio files |
| `GET` | `/api/audio/{id}?format=wav\|mp3` | audio with **byte-range** support (seeking) |

Interactive documentation: `/docs` (Swagger UI).

Example:

```bash
curl -X POST http://localhost:8000/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello from Voice Studio.","voice_id":"builtin","temperature":0.8}'
# → {"id":"…","status":"queued", …}
curl http://localhost:8000/api/jobs/<id>
```

---

## Features

- **Studio** — script editor with live counter, voice + language pickers,
  speed / exaggeration / CFG / temperature controls, generate button with
  loading/disabled/error states, per-chunk progress bar, cancel, regenerate,
  copy script.
- **Audio result card** — real waveform computed from the decoded audio,
  seek, duration, volume, playback speed, WAV download, MP3 when ffmpeg is
  available.
- **Voice library** — searchable cards with selection state, preview playback,
  metadata, delete.
- **Voice cloning** — drag-and-drop reference upload (5.5–30 s, validated),
  consent confirmation, name/description, sample generation, delete. Uses
  Chatterbox's real zero-shot reference workflow — no model training claims.
- **Long scripts** — sentence-aware chunking + sequential synthesis + safe
  concatenation, so memory stays bounded.
- **History** — every generation with voice/date/status/playback/downloads.
- **FAQ** — searchable accordion across 7 categories, written against the
  implemented behavior.
- **Safety** — input length limits, filename sanitization, no path/secret
  exposure in errors, consent gate for cloning, CORS via env var.

---

## Deployment

### Frontend → Vercel

1. Import the repo in Vercel, set **root directory** to `frontend/`.
2. Env var: `NEXT_PUBLIC_API_URL=https://<your-backend-host>`.
3. Deploy — the app is fully static except for runtime API calls.

### Backend → Railway (or any GPU host)

1. Create a service from `backend/` (Railway supports a Python service with a
   start command; a Dockerfile is provided in `backend/Dockerfile`).
2. Start command (non-Docker): `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Env vars: at minimum `CB_MODEL`, `CB_DEVICE=cuda` if a GPU is present,
   `CB_CORS_ORIGINS=https://<your-frontend>.vercel.app`, `CB_EAGER_LOAD=1`
   for predictable cold starts.
4. Attach a **persistent volume** at `CB_DATA_DIR` (e.g. `/data`) so voices and
   history survive redeploys.

**Reality check before you pick a plan:**

| Model | Download | RAM/VRAM at load | Notes |
|---|---|---|---|
| nano | ~1.9 GB | ~2.5 GB+ | CPU-usable, 8 cores ≈ near real-time |
| turbo | ~2.2 GB | ~3 GB+ | low-latency English, GPU recommended |
| english | ~3.2 GB | ~4 GB+ | best quality/controls, GPU recommended |
| multilingual | ~6.5 GB | ~8 GB+ | 23 languages, GPU strongly recommended |

- A free tier with 512 MB–1 GB RAM **cannot** run any checkpoint — expect
  `Model unavailable` in the UI. Verify memory, disk (model download) and
  startup time before committing.
- Startup = import + checkpoint load (30–90 s on CPU). Health reports
  `starting` until the model is `ready`.
- Inference on CPU for the 500M checkpoints is minutes per chunk; use CUDA in
  production.

### ffmpeg (optional MP3)

```bash
apt-get install -y ffmpeg     # or brew install ffmpeg
```

Without ffmpeg everything still works; the MP3 button simply stays hidden
(`/api/config.mp3_enabled`).

### Production checklist

- **Single worker only.** The TTS model singleton and the in-memory job queue
  are per-process. Run `uvicorn --workers 1` (the Dockerfile already pins
  this). Multiple workers would load multiple model copies (RAM blowup) and
  job polling would hit a process that cannot see the job.
- **Persistent volume** at `CB_DATA_DIR` so voices, previews and history
  survive redeploys.
- **Queue cap.** `CB_MAX_QUEUE` (default 25) bounds pending jobs; bursts
  above the cap get HTTP 429 instead of unbounded memory growth.
- **CORS.** Set `CB_CORS_ORIGINS` to your frontend origin (not `*`) in
  production.
- **Restart safety.** On boot, history entries stuck in `queued`/`processing`
  are marked `failed` ("Interrupted by server restart").
- **Voice previews.** The first successful generation with a cloned voice is
  auto-saved as its 15-second library preview (copy — the generation WAV is
  never moved).
- **Memory.** Pick a checkpoint whose RAM/VRAM fits the host (table above);
  free tiers with <2 GB cannot run any model.

---

## End-to-end verification

Run these after starting both servers:

```bash
# 1. health
curl -s $API/api/health | jq .engine.state        # "ready" after model load

# 2. clone a voice (consent required)
curl -X POST $API/api/voices \
  -F file=@reference.wav -F name="My Voice" -F consent=true

# 3. generate
JOB=$(curl -s -X POST $API/api/generate -H 'Content-Type: application/json' \
  -d '{"text":"Testing one two three.","voice_id":"builtin"}' | jq -r .id)
watch -n1 "curl -s $API/api/jobs/$JOB | jq '{status,progress,current_chunk,total_chunks}'"

# 4. download
curl -o out.wav "$API/api/audio/$JOB?format=wav"
ffprobe out.wav    # real audio, duration > 0
```

Then open the frontend: type a script → **Generate Speech** → waveform
appears → play → download WAV/MP3 → check **History**.

---

## License

- Chatterbox model & source: see `chatterbox/LICENSE` (official repository).
- This studio wrapper: provided as-is for your deployment.
