#!/bin/bash
# Detached launcher for Voice Studio backend (survives parent shell exit)
cd /root/tts/backend
exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
