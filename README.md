<div align="center">

# Location Scout

### AI-Powered Location Scouting for Film & Television

[Getting Started](#getting-started) | [Documentation](#api-reference) | [Contributing](#contributing)

---

**Automate weeks of location scouting in minutes.**

Location Scout combines script analysis AI, geolocation services, and AI voice negotiation to transform how production teams find and secure filming locations.

</div>

---

<div align="center">

### See it in action

[![Watch the demo](https://cdn.loom.com/sessions/thumbnails/b369488b49e3429dac34307d9008aef0-6d1f395766df8152.jpg)](https://www.loom.com/share/b369488b49e3429dac34307d9008aef0)

*Click to watch the demo*

</div>

---

## Why Location Scout?

Traditional location scouting takes **2-4 weeks** of manual work: reading scripts, searching online, making dozens of phone calls, and tracking everything in spreadsheets.

Location Scout automates this entire workflow:

| Traditional Process | With Location Scout |
|---------------------|---------------------|
| Manually read 120-page script | AI extracts all location requirements in seconds |
| Search Google Maps for hours | AI finds matching venues with visual verification |
| Make 50+ cold calls | AI voice agent handles outreach automatically |
| Track in spreadsheets | Dashboard with approvals and call recordings |

---

## How It Works

```
                    +-----------------+
                    |   Upload PDF    |
                    |   Screenplay    |
                    +--------+--------+
                             |
                             v
              +--------------+--------------+
              |      STAGE 1: ANALYZE       |
              |  Extract scenes & locations |
              |  Identify vibe & constraints|
              +--------------+--------------+
                             |
                             v
              +--------------+--------------+
              |      STAGE 2: DISCOVER      |
              |   Google Maps grounding     |
              |   Visual verification AI    |
              +--------------+--------------+
                             |
                             v
              +--------------+--------------+
              |      STAGE 3: OUTREACH      |
              |   AI voice calls to venues  |
              |   Capture pricing & avail.  |
              +--------------+--------------+
                             |
                             v
              +--------------+--------------+
              |      STAGE 4: REVIEW        |
              |   Dashboard & approvals     |
              |   Book confirmed locations  |
              +--------------+--------------+
```

---

## Features

**Script Analysis**
- Upload screenplay PDFs and extract location requirements automatically
- Identify aesthetic vibes (industrial, luxury, retro, etc.)
- Capture physical constraints (ceiling height, parking, power access)
- Smart deduplication of similar locations

**Location Discovery**
- AI-powered search using Google Maps Places API
- Visual verification with Gemini vision models
- Vibe validation using Perplexity
- Match scoring based on requirements

**Voice Outreach**
- Automated AI phone calls via Vapi.ai
- Context-aware conversations (venue name, project details, dates)
- Structured data capture (pricing, availability, contact info)
- Red flag identification

**Dashboard**
- Project and location management
- Call recordings and transcripts
- Human-in-the-loop approval workflow
- Export and booking integration

---

## Tech Stack

<table>
<tr>
<td valign="top" width="50%">

### Backend

- **Framework:** Python 3.11+ / FastAPI
- **AI Models:** Google Gemini 2.5 Flash
- **Visual AI:** Perplexity Sonar Pro
- **Database:** Supabase (PostgreSQL)
- **Voice:** Vapi.ai
- **PDF Processing:** PyMuPDF

</td>
<td valign="top" width="50%">

### Frontend

- **Framework:** Next.js 16 / React 19
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **Auth:** Supabase Auth
- **State:** React Server Components

</td>
</tr>
</table>

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+ and [pnpm](https://pnpm.io/)
- [uv](https://github.com/astral-sh/uv) package manager
- Google Cloud account with Vertex AI enabled
- Supabase project
- Vapi.ai account
- Perplexity API key

### Quick Start

**1. Clone the repository**
```bash
git clone https://github.com/your-org/location-scout.git
cd location-scout
```

**2. Set up the backend**
```bash
# Install dependencies
uv sync

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Authenticate with Google Cloud
gcloud auth application-default login

# Start the server
uv run uvicorn app.main:app --reload
```

**3. Set up the frontend**
```bash
cd web

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8000

# Start the dev server
pnpm dev
```

**4. Open the app**

- Frontend: http://localhost:3000
- API Docs: http://localhost:8000/docs

---

## Configuration

Create a `.env` file with the following variables:

```bash
# Google Cloud / Vertex AI
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_MAPS_API_KEY=your-maps-api-key
MAX_CONCURRENT_LLM_CALLS=15

# Perplexity (visual verification)
PERPLEXITY_API_KEY=pplx-xxx

# Supabase (database)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SECRET_KEY=your-secret-key

# Vapi.ai (voice calls)
VAPI_API_KEY=your-vapi-key
VAPI_PHONE_NUMBER_ID=your-phone-id
VAPI_ASSISTANT_ID=your-assistant-id
```

> **Note:** Enable "Street View Static API" and "Maps Static API" in your Google Cloud Console.

---

## API Reference

### Scripts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/scripts/upload` | Upload a screenplay PDF |
| `GET` | `/api/scripts/analyze` | Analyze script (SSE streaming) |
| `GET` | `/api/scripts/available` | List uploaded scripts |

### Grounding

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/grounding/ground-scene` | Ground a single scene |
| `POST` | `/api/grounding/ground-scenes` | Batch ground multiple scenes |
| `GET` | `/api/grounding/status/{id}` | Check grounding status |

### Calls

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/calls/trigger` | Trigger a voice call |
| `POST` | `/api/calls/batch` | Batch trigger calls |
| `GET` | `/api/calls/{id}` | Get call status |

### Projects & Locations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET/POST` | `/api/projects` | Manage projects |
| `GET/POST` | `/api/locations` | Manage location candidates |
| `PATCH` | `/api/locations/{id}/approve` | Approve a location |
| `PATCH` | `/api/locations/{id}/reject` | Reject a location |

---

## Project Structure

```
location-scout/
├── app/                        # Python backend
│   ├── main.py                 # FastAPI application
│   ├── config.py               # Environment configuration
│   ├── api/
│   │   ├── routes/             # API endpoints
│   │   └── middleware/         # Auth middleware
│   ├── services/               # Core business logic
│   ├── grounding/              # Location discovery agent
│   ├── vapi/                   # Voice call integration
│   ├── db/                     # Database layer
│   └── models/                 # Pydantic models
│
├── web/                        # Next.js frontend
│   ├── src/
│   │   ├── app/                # App router pages
│   │   ├── components/         # React components
│   │   └── lib/                # Utilities
│   └── public/                 # Static assets
│
├── testing/                    # Test suite
├── scripts/                    # Utility scripts
├── pyproject.toml              # Python dependencies
└── requirements.txt            # Pip requirements
```

---

## Development

```bash
# Run backend with hot reload
uv run uvicorn app.main:app --reload

# Run frontend with hot reload
cd web && pnpm dev

# Run tests
uv run pytest

# Run grounding tests
python -m testing.test_grounding --all

# Lint code
uv run ruff check app/
cd web && pnpm lint
```

---

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure your code passes linting and tests before submitting.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built for filmmakers, by filmmakers.**

[Report Bug](https://github.com/your-org/location-scout/issues) | [Request Feature](https://github.com/your-org/location-scout/issues)

</div>
