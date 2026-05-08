#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
pnpm install --prod
pnpm build
exec pnpm start
