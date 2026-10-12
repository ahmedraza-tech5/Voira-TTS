#!/bin/bash
set -e
export UV_LINK_MODE=copy
UV=/root/.local/bin/uv
cd /root/tts
rm -rf /root/.cache/uv/archive-v0
rm -rf backend/.venv
$UV venv backend/.venv --python 3.12
$UV pip install --python backend/.venv/bin/python \
  torch==2.6.0 torchaudio==2.6.0 numpy==1.26.4 librosa==0.11.0 \
  s3tokenizer transformers==5.2.0 diffusers==0.29.0 \
  conformer==0.3.2 safetensors==0.5.3 spacy-pkuseg pykakasi==2.3.0 \
  pyloudnorm omegaconf fastapi "uvicorn[standard]" python-multipart \
  "pydantic>=2" huggingface_hub soundfile scipy
$UV pip install --python backend/.venv/bin/python "resemble-perth @ git+https://github.com/resemble-ai/Perth.git@master"
$UV pip install --python backend/.venv/bin/python --no-deps -e /root/tts/chatterbox
echo "REINSTALL_OK"
