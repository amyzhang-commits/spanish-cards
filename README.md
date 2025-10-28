# Spanish Cards 🇪🇸

Offline-first Spanish verb conjugation flashcard trainer with AI-powered generation.

## Quick Start

### One-Command Launch
```bash
./start.sh
```

This will:
- ✅ Start Ollama (if installed)
- ✅ Pull the aya:8b model (if needed)
- ✅ Launch the web server on http://localhost:8080
- 🎯 Work offline if Ollama isn't available (basic conjugation patterns)

### Manual Launch
If you prefer to run services separately:

```bash
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Start web server
python -m http.server 8080 --directory static
```

Then open http://localhost:8080 in your browser.

## Features

- 📚 Generate flashcards for specific tenses and moods
- 🧠 AI-powered conjugations (via Ollama)
- 📱 Works completely offline (basic patterns)
- 💾 Local storage with IndexedDB
- 🔄 Study mode with spaced repetition
- ✏️ Process and learn from Spanish sentences

## Requirements

- Python 3.x (for web server)
- [Ollama](https://ollama.ai) (optional, for AI-powered conjugations)

Without Ollama, the app will use basic conjugation patterns for regular verbs.
