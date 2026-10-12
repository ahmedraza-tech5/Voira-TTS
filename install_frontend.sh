#!/bin/bash
set -e
cd /root/tts
rm -rf frontend
npx --yes create-next-app@latest frontend --ts --tailwind --app --no-eslint --no-src-dir --import-alias "@/*" --use-npm --yes --skip-install
cd frontend
npm install
echo "FRONTEND_OK"
