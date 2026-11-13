#!/bin/sh
# Bundles the server for Cloudflare Pages into functions/ (committed, so Cloudflare needs no build step).
set -e
npx --yes esbuild@0.24.0 cf/entry.js --bundle --format=esm --platform=neutral --target=es2022 \
  --alias:@netlify/blobs=./cf/blobs-stub.js --loader:.json=json --outfile=cf/server.bundle.js
cat > 'functions/[[path]].js' <<'JS'
export { onRequest } from "../cf/server.bundle.js";
JS
echo built
