#!/usr/bin/env bash
# Upsert bootstrap keys into gitignored .fnox/env for mise/fnox tasks.
# Safe to re-run; preserves unrelated keys.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/.fnox/env"

mkdir -p "${ROOT}/.fnox"
chmod 700 "${ROOT}/.fnox"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

upsert() {
  local key="$1"
  local value="$2"
  if [ -z "$value" ]; then
    return 0
  fi
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    local tmp
    tmp="$(mktemp)"
    grep -v "^${key}=" "$ENV_FILE" >"$tmp" || true
    mv "$tmp" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
  fi
  printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
}

upsert OP_SERVICE_ACCOUNT_TOKEN "${OP_SERVICE_ACCOUNT_TOKEN:-}"
upsert VERCEL_TOKEN "${VERCEL_TOKEN:-}"
