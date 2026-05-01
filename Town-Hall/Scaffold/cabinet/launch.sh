#!/bin/bash
# Cabinet of Curiosities — one-command launcher
# Usage: ./launch.sh [folder-to-browse]
# If a folder is given, it opens the cabinet with that folder pre-selected.
# Otherwise, opens the cabinet for drag-and-drop.

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=8093

# Kill any existing instance
lsof -ti:$PORT 2>/dev/null | xargs kill 2>/dev/null || true

# Start a simple HTTP server
cd "$DIR"
python3 -m http.server $PORT --bind 127.0.0.1 &
SERVER_PID=$!

sleep 1
open "http://localhost:$PORT/index.html"

echo "Cabinet running at http://localhost:$PORT/index.html"
echo "Press Ctrl+C to stop"

wait $SERVER_PID
