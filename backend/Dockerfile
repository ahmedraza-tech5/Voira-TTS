# Backend Dockerfile for Railway/Render/Fly.io
FROM python:3.12-slim

WORKDIR /app

# System deps for audio + git (Perth install ke liye)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Perth (Resemble AI watermarker) - git se install
RUN pip install --no-cache-dir "resemble-perth @ git+https://github.com/resemble-ai/Perth.git@master"

# Chatterbox local package
COPY chatterbox /app/chatterbox
RUN pip install --no-cache-dir -e /app/chatterbox

# App code
COPY . .

# Data directories (persistent volume mount karega /data pe)
ENV CB_DATA_DIR=/data
RUN mkdir -p /data/voices /data/generations /data/uploads

EXPOSE 8000
CMD ["bash", "start.sh"]