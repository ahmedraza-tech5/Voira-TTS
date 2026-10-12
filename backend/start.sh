#!/bin/bash
# Start Voira TTS backend (works on Railway + local)
# Use local venv if exists, otherwise global uvicorn
if [ -f ".venv/bin/uvicorn" ]; then
  exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
else
  exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
fi