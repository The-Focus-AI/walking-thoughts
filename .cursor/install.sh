#!/usr/bin/env bash
# Idempotent Cursor Cloud update/install bootstrap for Walking Thoughts.
# Installs mise + 1Password CLI, activates mise shims, installs project tools,
# bootstraps fnox when a service-account token is available, then installs deps.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Prefer user-local tooling even before bashrc is sourced.
export PATH="${HOME}/.local/bin:${HOME}/.local/share/mise/shims:${PATH}"

log() { printf '▶ %s\n' "$*"; }
warn() { printf '⚠ %s\n' "$*" >&2; }

ensure_path_line() {
  local line="$1"
  local file="$2"
  touch "$file"
  if ! grep -Fqx "$line" "$file"; then
    printf '\n%s\n' "$line" >>"$file"
  fi
}

arch="$(uname -m)"
case "$arch" in
  x86_64 | amd64) op_arch="amd64" ;;
  aarch64 | arm64) op_arch="arm64" ;;
  *)
    warn "Unsupported architecture for 1Password CLI: $arch"
    op_arch=""
    ;;
esac

# --- mise -----------------------------------------------------------------
if ! command -v mise >/dev/null 2>&1; then
  log "Installing mise"
  curl -fsSL https://mise.run | sh
else
  log "mise already present: $(command -v mise)"
fi

export PATH="${HOME}/.local/bin:${PATH}"
if [ -x "${HOME}/.local/bin/mise" ]; then
  eval "$("${HOME}/.local/bin/mise" activate bash --shims)"
elif command -v mise >/dev/null 2>&1; then
  eval "$(mise activate bash --shims)"
fi

# Cloud agents reset PATH; shims in bashrc keep non-interactive shells working.
ensure_path_line 'export PATH="$HOME/.local/bin:$PATH"' "${HOME}/.bashrc"
ensure_path_line 'export PATH="$HOME/.local/share/mise/shims:$PATH"' "${HOME}/.bashrc"
if [ -f "${HOME}/.profile" ] || [ ! -e "${HOME}/.profile" ]; then
  ensure_path_line 'export PATH="$HOME/.local/bin:$PATH"' "${HOME}/.profile"
  ensure_path_line 'export PATH="$HOME/.local/share/mise/shims:$PATH"' "${HOME}/.profile"
fi

# --- 1Password CLI --------------------------------------------------------
if ! command -v op >/dev/null 2>&1; then
  if [ -z "$op_arch" ]; then
    warn "Skipping 1Password CLI install (unsupported arch)"
  else
    log "Installing 1Password CLI"
    if ! command -v unzip >/dev/null 2>&1; then
      sudo apt-get update -qq
      sudo apt-get install -y --no-install-recommends unzip
    fi
    op_version="v$(curl -fsSL 'https://app-updates.agilebits.com/check/1/0/CLI2/en/2.0.0/N' | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -n1)"
    tmp_zip="$(mktemp /tmp/op.XXXXXX.zip)"
    curl -fsSLo "$tmp_zip" "https://cache.agilebits.com/dist/1P/op2/pkg/${op_version}/op_linux_${op_arch}_${op_version}.zip"
    sudo unzip -od /usr/local/bin "$tmp_zip"
    rm -f "$tmp_zip"
    sudo groupadd -f onepassword-cli
    sudo chgrp onepassword-cli /usr/local/bin/op
    sudo chmod g+s /usr/local/bin/op
  fi
else
  log "op already present: $(command -v op) ($(op --version 2>/dev/null || true))"
fi

# --- project tools via mise ----------------------------------------------
log "Trusting and installing mise tools from mise.toml"
mise trust "$ROOT/mise.toml"
# Tasks use bash; ensure this machine's mise settings match even before
# mise.toml settings are loaded by older checkpoints.
mise settings set unix_default_inline_shell_args 'bash -c -o errexit' >/dev/null
mise install

# Ensure current shell can see shims after tool install.
eval "$(mise activate bash --shims)"
export PATH="${HOME}/.local/share/mise/shims:${HOME}/.local/bin:${PATH}"

# --- fnox bootstrap -------------------------------------------------------
mkdir -p .fnox && chmod 700 .fnox
if [ -s .fnox/env ]; then
  log ".fnox/env already present — skipping secret bootstrap"
elif [ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
  log "Writing .fnox/env from OP_SERVICE_ACCOUNT_TOKEN"
  umask 077
  printf 'OP_SERVICE_ACCOUNT_TOKEN=%s\n' "$OP_SERVICE_ACCOUNT_TOKEN" >.fnox/env
  chmod 600 .fnox/env
elif command -v op >/dev/null 2>&1; then
  log "Attempting mise run setup (op read of project service-account token)"
  if mise run setup; then
    log "fnox bootstrap via mise run setup succeeded"
  else
    warn "Could not bootstrap .fnox/env. Add OP_SERVICE_ACCOUNT_TOKEN to Cursor Cloud Secrets,"
    warn "or authenticate op so 'mise run setup' can read the thefocus vault item."
  fi
else
  warn "Neither OP_SERVICE_ACCOUNT_TOKEN nor op is available; secrets remain unconfigured."
fi

# --- app dependencies -----------------------------------------------------
log "Installing project dependencies"
mise run install

log "Cursor Cloud environment ready"
command -v mise
command -v op || true
command -v pnpm
command -v node
mise --version
node --version
pnpm --version
