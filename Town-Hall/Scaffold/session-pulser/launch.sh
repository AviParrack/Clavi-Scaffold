#!/bin/bash
# Session Pulser — one-command launcher
# Usage: ./launch.sh [--no-open]

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Kill any existing instance
pkill -f "node.*server.js.*8092" 2>/dev/null || true

# Check deps
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install --silent
fi

# Regenerate data
echo "Scanning session history..."
python3 generate-session-data.py

# Start server in background
node server.js &
SERVER_PID=$!
echo "Server running (PID $SERVER_PID)"

# Open browser unless --no-open
if [ "$1" != "--no-open" ]; then
  sleep 1
  open "http://localhost:8092/session-dashboard.html" 2>/dev/null || \
  xdg-open "http://localhost:8092/session-dashboard.html" 2>/dev/null || \
  echo "Open http://localhost:8092/session-dashboard.html"
fi

echo ""
echo "Session Pulser running at http://localhost:8092/session-dashboard.html"
echo "Press Ctrl+C to stop"

# Wait for server (Ctrl+C kills it)
wait $SERVER_PID
