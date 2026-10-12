# Voira TTS — Quick Deploy Guide

## Option A: Railway (Backend) + Vercel (Frontend) — RECOMMENDED

### 1. Backend → Railway
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login & create project
railway login
cd /root/tts/backend
railway init    # select "Create new project" → name: voira-tts-api

# Set environment variables (Railway dashboard → Variables)
railway variables set CB_MODEL=nano
railway variables set CB_DEVICE=cpu
railway variables set CB_EAGER_LOAD=1
railway variables set CB_DATA_DIR=/data
railway variables set CB_CORS_ORIGINS=https://your-frontend.vercel.app

# Add persistent volume (Railway dashboard → Volumes → Add Volume → Mount Path: /data)

# Deploy
railway up
```

### 2. Frontend → Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd /root/tts/frontend
vercel login
vercel --prod

# Set environment variable (Vercel dashboard → Settings → Environment Variables)
# NEXT_PUBLIC_API_URL = https://your-railway-backend.up.railway.app
```

### 3. Connect them
- Update `/root/tts/frontend/vercel.json` → replace `YOUR_RAILWAY_BACKEND` with actual Railway URL
- Redeploy: `vercel --prod`

---

## Option B: Single VPS (Docker Compose) — Simplest

```bash
# On your VPS (Ubuntu/Debian)
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
cd /root/tts
docker compose up -d --build

# Access:
# Frontend: http://YOUR_VPS_IP:3000
# Backend API: http://YOUR_VPS_IP:8000
```

---

## Option C: Render (Backend) + Vercel (Frontend)

Similar to Railway — Render has free tier with 512MB RAM (may be tight for nano model). Use `CB_MODEL=english` for better quality if RAM allows.

---

## Required Files (Already Created)
```
tts/
├── backend/
│   ├── Dockerfile
│   ├── start.sh
│   └── requirements.txt
├── frontend/
│   ├── Dockerfile
│   ├── vercel.json
│   └── next.config.ts (output: standalone)
├── docker-compose.yml
└── DEPLOY.md (this file)
```

---

## Model Selection (CB_MODEL)
| Model | Size | RAM (CPU) | Quality | Languages |
|-------|------|-----------|---------|-----------|
| `nano` | 110M | ~2GB | Good | EN only |
| `turbo` | 350M | ~3GB | Better | EN only |
| `english` | 500M | ~4GB | Best EN | EN only |
| `multilingual` | 1.2B | ~6GB | Best | 23+ langs |

**For free tiers:** Use `nano` or `turbo`.

---

## Persistent Data
- Voices: `/data/voices` (14 preset + your cloned)
- Generations: `/data/generations`
- History: `/data/history.json`
- Model cache: `~/.cache/huggingface` (auto-downloads first run ~3.3GB)

**Railway/Render:** Add Volume mounted at `/data`
**VPS:** `docker compose` volume `voira_data` handles it

---

## CORS Fix
If frontend can't call backend:
1. Backend `CB_CORS_ORIGINS=https://your-frontend.vercel.app`
2. Or use Vercel rewrites (in `vercel.json`) to proxy `/api/*` to backend

---

## Verify Deployment
```bash
# Backend health
curl https://your-backend.up.railway.app/api/voices

# Frontend
open https://your-frontend.vercel.app
```

---

## Troubleshooting
- **Backend crashes on start:** Check logs → usually model download (first run takes 2-3 min)
- **Out of memory:** Use `nano` model, or upgrade RAM
- **Voices not showing:** Backend must be UP before frontend loads (see UX fix in code)
- **Audio not playing:** Check browser console → CORS or backend URL wrong

---

## Custom Domain (Optional)
- Vercel: Settings → Domains → Add
- Railway: Settings → Domains → Add
- Update `CB_CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` accordingly