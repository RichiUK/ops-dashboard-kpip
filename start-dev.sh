#!/bin/bash
export PATH="/Users/richi/.nvm/versions/node/v20.19.1/bin:$PATH"
cd "$(dirname "$0")"
exec npm run dev -- --port 3033
