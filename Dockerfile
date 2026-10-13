# Root Dockerfile — builds only the Voira TTS backend
# Railway builds from repo root; this image copies backend + chatterbox only.
FROM python:3.12-slim

# System deps for audio processing + git for Perth install
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps first (layer caching)
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Perth watermarker (git install)
RUN pip install --no-cache-dir "resemble-perth @ git+https://github.com/resemble-ai/Perth.git@master"

# Chatterbox local package
COPY chatterbox ./chatterbox
RUN pip install --no-cache-dir -e ./chatterbox

# App code (includes preset voices in backend/data/voices)
COPY backend ./backend

WORKDIR /app/backend

# Persistent data dir (Railway volume mounts here)
ENV CB_DATA_DIR=/data
ENV CB_EAGER_LOAD=1
RUN mkdir -p /data/voices /data/generations /data/uploads

# Seed preset voices into the persistent volume on first boot
RUN printf '#!/bin/bash\nset -e\nmkdir -p /data/voices /data/generations /data/uploads\nif [ ! -f /data/voices/studio_nova/meta.json ]; then\n  echo "Seeding preset voices into /data..."\n  cp -rn /app/backend/data/voices/* /data/voices/ 2>/dev/null || true\nfi\necho "Starting Voira TTS API on 0.0.0.0:${PORT:-8000}..."\nexec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --log-config /app/backend/log_config.json\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE 8000
CMD ["/app/entrypoint.sh"]