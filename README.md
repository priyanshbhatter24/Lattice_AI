# Location Scout

AI-powered location scouting for film production.

## Setup

1. Copy `.env.example` to `.env` and add your OpenAI API key
2. Install dependencies: `uv sync`
3. Run the server: `uv run uvicorn app.main:app --reload`

## Usage

Analyze a screenplay PDF:
```bash
curl -N "http://localhost:8000/api/scripts/analyze?file_path=path/to/screenplay.pdf"
```
