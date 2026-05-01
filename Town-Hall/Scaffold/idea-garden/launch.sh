#!/bin/bash
# Idea Garden — one-command launcher
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=8094

# Kill any existing instance
lsof -ti:$PORT 2>/dev/null | xargs kill 2>/dev/null || true

cd "$DIR"

# Regenerate garden data
echo "Generating garden data..."
python3 generate-garden-data.py

# Start HTTP server
python3 -m http.server $PORT --bind 127.0.0.1 &
SERVER_PID=$!

sleep 1
open "http://localhost:$PORT/garden.html"

echo ""
echo "Idea Garden running at http://localhost:$PORT/garden.html"
echo "Click LOAD WORKSPACE to visualize your notes"
echo "Press Ctrl+C to stop"

wait $SERVER_PID
