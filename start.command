#!/bin/zsh
set -e

cd "${0:A:h}"

PYTHON="$PWD/.venv/bin/python3"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="$(command -v python3)"
fi

exec "$PYTHON" -m content_reader.server --open
