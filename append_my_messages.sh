#!/bin/bash
# Appends only NEW user messages from Claude Code history since last run.
# Usage: bash append_my_messages.sh [output_file]
# Tip: Run this at end of day to log today's messages.

OUTPUT="${1:-my_claude_messages.md}"
CLAUDE_DIR="$HOME/.claude"
LAST_RUN_FILE="$HOME/.claude_msg_last_run"

# Read last-run timestamp (epoch seconds), default to 0 (get everything)
LAST_RUN=0
if [[ -f "$LAST_RUN_FILE" ]]; then
    LAST_RUN=$(cat "$LAST_RUN_FILE")
fi

NOW=$(date +%s)
TODAY=$(date "+%Y-%m-%d")
NEW_COUNT=0

# Create file with header if it doesn't exist
if [[ ! -f "$OUTPUT" ]]; then
    echo "# My Claude Code Messages" > "$OUTPUT"
    echo "" >> "$OUTPUT"
fi

# Temp buffer for today's new messages
TEMP=$(mktemp)

echo "## Session: $TODAY $(date '+%H:%M')" >> "$TEMP"
echo "" >> "$TEMP"

# Walk all JSONL files
find "$CLAUDE_DIR" -name "*.jsonl" 2>/dev/null | sort | while read -r file; do
    PROJECT=$(basename "$(dirname "$file")")

    while IFS= read -r line; do
        ROLE=$(echo "$line" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('role','') or d.get('type',''))
" 2>/dev/null)

        [[ "$ROLE" != "user" ]] && continue

        # Parse timestamp to epoch
        MSG_EPOCH=$(echo "$line" | python3 -c "
import sys, json, datetime, re
d = json.load(sys.stdin)
ts = d.get('timestamp') or d.get('ts') or ''
if not ts:
    print(0); sys.exit()
try:
    # Handle ISO 8601 with or without timezone
    ts_clean = re.sub(r'(\+\d{2}:\d{2}|Z)$', '', ts)
    dt = datetime.datetime.fromisoformat(ts_clean)
    print(int(dt.timestamp()))
except:
    print(0)
" 2>/dev/null)

        # Skip if older than last run
        [[ "$MSG_EPOCH" -le "$LAST_RUN" ]] && continue

        # Format timestamp for display
        TS_DISPLAY=$(echo "$line" | python3 -c "
import sys, json, datetime, re
d = json.load(sys.stdin)
ts = d.get('timestamp') or d.get('ts') or ''
if not ts:
    print(''); sys.exit()
try:
    ts_clean = re.sub(r'(\+\d{2}:\d{2}|Z)$', '', ts)
    dt = datetime.datetime.fromisoformat(ts_clean)
    print(dt.strftime('%Y-%m-%d %H:%M:%S'))
except:
    print(ts)
" 2>/dev/null)

        MSG=$(echo "$line" | python3 -c "
import sys, json
d = json.load(sys.stdin)
content = d.get('content', '')
if isinstance(content, list):
    texts = [b.get('text','') for b in content if isinstance(b, dict) and b.get('type') == 'text']
    content = ' '.join(texts)
print(content[:2000])
" 2>/dev/null)

        if [[ -n "$MSG" ]]; then
            echo "**[$TS_DISPLAY] [$PROJECT]**" >> "$TEMP"
            echo "$MSG" >> "$TEMP"
            echo "" >> "$TEMP"
            NEW_COUNT=$((NEW_COUNT + 1))
        fi

    done < "$file"
done

echo "---" >> "$TEMP"
echo "" >> "$TEMP"

# Only append if there's something new
if [[ "$NEW_COUNT" -gt 0 ]]; then
    cat "$TEMP" >> "$OUTPUT"
    echo "$NOW" > "$LAST_RUN_FILE"
    echo "✅ Appended $NEW_COUNT new message(s) to $OUTPUT"
else
    echo "ℹ️  No new messages since last run ($(date -r $LAST_RUN_FILE 2>/dev/null || echo 'never'))"
fi

rm "$TEMP"
