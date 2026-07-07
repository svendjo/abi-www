#!/usr/bin/env bash
#
# Deploy abi-www to AWS (S3 + CloudFront).
#
# Quick update of the already-set-up site (see abi-server/DEPLOY.md for the full
# guide and the one-time setup). Make sure the *_URL constants in src/App.js point
# at the deployed abi-server, and that you're signed in to AWS, before running.
#
# Usage: ./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Preflight: checking AWS credentials"
if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "ERROR: not signed in to AWS (aws sts get-caller-identity failed)." >&2
  echo "       Authenticate first, then re-run ./deploy.sh" >&2
  exit 1
fi

echo "==> Building production bundle"
npm run build

echo "==> Syncing ./build to s3://balut-frontend"
aws s3 sync ./build s3://balut-frontend --delete

echo "==> Invalidating CloudFront cache (/*)"
aws cloudfront create-invalidation --distribution-id E2P072IUYX7U7M --paths "/*"

echo "==> Done"
