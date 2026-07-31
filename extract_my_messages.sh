#!/bin/bash
# Extract your user messages from Claude Code conversation history
# Usage: bash extract_my_messages.sh [output_file]

OUTPUT="${1:-my_claude_messages.md}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

node "$SCRIPT_DIR/extract_my_messages.js" "$OUTPUT"
