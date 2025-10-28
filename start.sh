#!/bin/bash

# Spanish Cards - Startup Script
# Launches both the web server and Ollama

echo "🚀 Starting Spanish Cards..."

# Detect python command (prefer uv if available)
if command -v uv &> /dev/null; then
    PYTHON_CMD="uv run python"
elif command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Python not found. Please install Python 3."
    exit 1
fi

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "⚠️  Ollama not found. Install from https://ollama.ai"
    echo "📱 Starting in offline-only mode..."
    $PYTHON_CMD -m http.server 8080 --directory static
    exit 0
fi

# Check if Ollama is already running
if ! pgrep -x "ollama" > /dev/null; then
    echo "🧠 Starting Ollama..."
    ollama serve > /dev/null 2>&1 &
    OLLAMA_PID=$!
    sleep 2
    echo "✅ Ollama started (PID: $OLLAMA_PID)"
else
    echo "✅ Ollama already running"
fi

# Check if aya:8b model is available
if ! ollama list | grep -q "aya:8b"; then
    echo "📥 Aya model not found. Pulling..."
    ollama pull aya:8b
fi

echo "🌐 Starting web server on http://localhost:8080"
echo "📚 Open http://localhost:8080 in your browser"
echo ""
echo "Press Ctrl+C to stop all services"

# Trap to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    if [ ! -z "$OLLAMA_PID" ]; then
        kill $OLLAMA_PID 2>/dev/null
    fi
    exit 0
}

trap cleanup INT TERM

# Start the web server
$PYTHON_CMD -m http.server 8080 --directory static
