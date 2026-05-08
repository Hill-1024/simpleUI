#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile
pnpm build
exec pnpm start
