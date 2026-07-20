#!/bin/zsh
set -euo pipefail

PROJECT_ROOT="${0:A:h}"
cd "$PROJECT_ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  print "This guided installer currently targets macOS. See docs/setup.md for manual setup."
fi

SYSTEM_PYTHON="${MARGIN_PYTHON:-$(command -v python3 || true)}"
if [[ -z "$SYSTEM_PYTHON" ]]; then
  print "Python 3.12 or newer is required. Install it, then run this file again."
  print "Homebrew: brew install python"
  exit 1
fi
if ! "$SYSTEM_PYTHON" -c 'import sys; raise SystemExit(sys.version_info < (3, 12))'; then
  print "Margin requires Python 3.12 or newer. Current: $($SYSTEM_PYTHON --version)"
  exit 1
fi

VENV_PYTHON="$PROJECT_ROOT/.venv/bin/python3"
if [[ ! -x "$VENV_PYTHON" ]]; then
  print "Creating Margin's private Python environment…"
  "$SYSTEM_PYTHON" -m venv "$PROJECT_ROOT/.venv"
fi
print "Installing Margin's Python packages…"
"$VENV_PYTHON" -m pip install --upgrade pip
"$VENV_PYTHON" -m pip install -r requirements.txt

if [[ ! -f "$PROJECT_ROOT/config.json" ]]; then
  print ""
  print "Choose where Margin should keep your notes:"
  print "  1) An ordinary Markdown folder"
  print "  2) An existing Obsidian vault"
  read "STORAGE_CHOICE?Choice [1]: "
  STORAGE_CHOICE="${STORAGE_CHOICE:-1}"
  if [[ "$STORAGE_CHOICE" == "2" ]]; then
    STORAGE_MODE="obsidian"
    DEFAULT_STORAGE="$HOME/Documents/Obsidian"
    read "STORAGE_PATH?Existing Obsidian vault path [$DEFAULT_STORAGE]: "
  else
    STORAGE_MODE="folder"
    DEFAULT_STORAGE="$HOME/Documents/Margin Notes"
    read "STORAGE_PATH?Notes folder [$DEFAULT_STORAGE]: "
  fi
  STORAGE_PATH="${STORAGE_PATH:-$DEFAULT_STORAGE}"
  "$VENV_PYTHON" scripts/create_initial_config.py \
    "$PROJECT_ROOT/config.json" "$STORAGE_MODE" "$STORAGE_PATH"
fi

print ""
if ! command -v pdftoppm >/dev/null 2>&1; then
  print "PDF rendering helper not found: Poppler"
  print "Install when ready: brew install poppler"
fi
if ! command -v soffice >/dev/null 2>&1 && \
   [[ ! -x "/Applications/LibreOffice.app/Contents/MacOS/soffice" ]]; then
  print "PowerPoint rendering helper not found: LibreOffice"
  print "Install when ready: brew install --cask libreoffice"
fi

INSTALL_AGENT=false
if [[ "${1:-}" == "--launch-agent" ]]; then
  INSTALL_AGENT=true
elif [[ -t 0 ]]; then
  read "AGENT_CHOICE?Start Margin automatically when you sign in? [y/N]: "
  [[ "${AGENT_CHOICE:l}" == "y" || "${AGENT_CHOICE:l}" == "yes" ]] && INSTALL_AGENT=true
fi
if $INSTALL_AGENT; then
  "$VENV_PYTHON" scripts/install_macos_launch_agent.py "$PROJECT_ROOT"
fi

print ""
print "Margin is installed. Start it with: ./start.command"
print "Then activate https://icycrucifix.github.io/margin/workspace/"
