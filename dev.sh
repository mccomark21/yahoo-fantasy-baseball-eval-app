#!/usr/bin/env bash
PORT=5173
URL="http://localhost:$PORT/yahoo-fantasy-baseball-eval-app/"

# Kill anything on the port
kill $(lsof -ti:$PORT) 2>/dev/null || true

# Start Vite
npm run dev -- --port $PORT &
SERVER_PID=$!

echo "Starting dev server (pid $SERVER_PID)..."
sleep 3

# Open in browser (Windows)
start "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null || open "$URL" 2>/dev/null || true

echo "Opened $URL"
echo "Press Ctrl+C to stop."
wait $SERVER_PID
