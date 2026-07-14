#!/bin/zsh
set -e

cd "${0:A:h}"

RUNTIME_ROOT="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
export PATH="$RUNTIME_ROOT/bin/override:$RUNTIME_ROOT/bin/fallback:$RUNTIME_ROOT/node/bin:/Applications/ChatGPT.app/Contents/Resources:$PATH"

PYTHON="$RUNTIME_ROOT/python/bin/python3"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="$(command -v python3)"
fi

exec "$PYTHON" -m content_reader.server --open
