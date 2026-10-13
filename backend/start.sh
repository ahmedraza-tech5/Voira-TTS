#!/bin/bash
# Start Voira TTS backend (works on Railway + local)
# Logs go to STDOUT so container platforms (Railway/Vercel/etc.) don't
# misclassify healthy startup lines as errors.
cd "$(dirname "$0")"

LOG_CFG="log_config.json"
if [ -f ".venv/bin/uvicorn" ]; then
  UV=.venv/bin/uvicorn
else
  UV=uvicorn
fi

if [ -f "$LOG_CFG" ]; then
  exec "$UV" app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1 --log-config "$LOG_CFG"
else
  exec "$UV" app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
fi