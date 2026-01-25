# Location Scout AI - Implementation Plan

## Overview
An agentic location scouting system for film production that:
1. Parses scripts to extract scenes and location requirements
2. Uses browser agents to search multiple location sources
3. Scores location-scene matches using Gemini multimodal
4. Conducts live outreach via Vapi voice agents
5. Presents results in a polished web dashboard

## Tech Stack
- **Runtime**: Python 3.11+
- **Backend**: FastAPI + Uvicorn
- **Browser Automation**: Browserbase (managed browser infrastructure)
- **AI/Matching**: Google Gemini (multimodal vision)
- **Voice Agent**: Vapi.ai
- **Database**: Supabase (Postgres + realtime)
- **Vector Store**: Supabase pgvector extension
- **Frontend**: React + Vite + TailwindCSS + Shadcn/ui (clean minimal theme)
- **State Management**: Zustand
- **Real-time Updates**: Supabase Realtime + SSE

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │  Upload  │ │  Scene   │ │ Location │ │    Dashboard     │   │
│  │  Script  │ │  Editor  │ │  Gallery │ │  (Results/Map)   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │ SSE
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (FastAPI)                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Agent Orchestrator                     │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────────┐    │  │
│  │  │  Script    │ │  Browser   │ │   Voice/Outreach   │    │  │
│  │  │  Parser    │ │  Agents    │ │      Agent         │    │  │
│  │  └────────────┘ └────────────┘ └────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │  Gemini API    │  │   Vapi API     │  │   Supabase     │   │
│  │  (Matching)    │  │   (Voice)      │  │   (Postgres)   │   │
│  └────────────────┘  └────────────────┘  └────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
location-scout/
├── pyproject.toml               # Python dependencies (uv/poetry)
├── .env.example
├── requirements.txt
│
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI entry point
│   ├── config.py                # Environment config (pydantic-settings)
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── scripts.py       # Upload & parse scripts
│   │   │   ├── scenes.py        # Scene CRUD
│   │   │   ├── locations.py     # Location management
│   │   │   ├── search.py        # Trigger browser agents
│   │   │   ├── outreach.py      # Voice/email outreach
│   │   │   └── events.py        # SSE endpoint
│   │   └── deps.py              # Dependencies (DB session, etc.)
│   │
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── orchestrator.py      # Coordinates all agents
│   │   ├── script_parser.py     # Extract scenes from script
│   │   ├── browser/
│   │   │   ├── __init__.py
│   │   │   ├── browserbase.py   # Browserbase client wrapper
│   │   │   ├── airbnb.py        # Airbnb scraper
│   │   │   └── google.py        # Google Maps + Images
│   │   ├── matcher.py           # Gemini multimodal scoring
│   │   └── voice/
│   │       ├── __init__.py
│   │       ├── vapi_client.py   # Vapi integration
│   │       └── call_scripts.py  # Conversation templates
│   │
│   ├── db/
│   │   ├── __init__.py
│   │   ├── supabase.py          # Supabase client
│   │   ├── models.py            # Pydantic models for DB
│   │   └── queries.py           # Database query functions
│   │
│   ├── memory/
│   │   ├── __init__.py
│   │   ├── scene_memory.py      # Scene requirements cache
│   │   ├── location_memory.py   # Location data cache
│   │   ├── outreach_memory.py   # Call/email history
│   │   └── matching_memory.py   # Score cache (ChromaDB)
│   │
│   └── utils/
│       ├── __init__.py
│       ├── image.py             # Image download/processing
│       ├── embeddings.py        # Text embeddings
│       └── logger.py            # Structured logging (structlog)
│
├── web/                         # Frontend (React)
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ScriptUpload.tsx
│   │   │   ├── SceneList.tsx
│   │   │   ├── SceneCard.tsx
│   │   │   ├── LocationGrid.tsx
│   │   │   ├── LocationCard.tsx
│   │   │   ├── MatchScore.tsx
│   │   │   ├── OutreachPanel.tsx
│   │   │   ├── MapView.tsx
│   │   │   └── Dashboard.tsx
│   │   ├── hooks/
│   │   │   ├── useSSE.ts
│   │   │   └── useLocations.ts
│   │   ├── store/
│   │   │   └── index.ts         # Zustand store
│   │   └── lib/
│   │       └── api.ts           # API client
│   └── public/
│
├── scripts/
│   ├── seed_demo.py             # Demo data seeder
│   └── test_vapi.py             # Test voice agent
│
├── supabase/
│   └── migrations/
│       └── 001_initial.sql      # Initial schema
│
└── data/
    └── demo_script.txt          # Sample demo script
```

---

## Implementation Steps

### Phase 1: Project Setup & Core Infrastructure

**1.1 Initialize Project**
- Initialize Python project with uv (pyproject.toml)
- Configure Ruff for linting/formatting
- Set up FastAPI with CORS, static file serving
- Configure pydantic-settings for environment variables

**1.2 Database Setup (Supabase)**
- Create Supabase project
- Run SQL migrations for tables (scripts, scenes, locations, outreach_logs, match_scores)
- Set up Supabase Python client
- Create seed script for demo data
- Configure Supabase Realtime for live updates

**1.3 Frontend Scaffolding**
- Initialize Vite + React + TypeScript
- Install Tailwind, Shadcn/ui components
- Set up Zustand store
- Create basic layout and routing

### Phase 2: Script Parsing Agent

**2.1 Script Parser**
- Accept script text/file upload
- Use Gemini to extract:
  - Scene sluglines (INT/EXT, LOCATION, TIME)
  - Visual requirements (mood, lighting, period)
  - Functional requirements (size, props, access needs)
  - Location type classification

**2.2 Scene Memory**
- Store extracted scenes in DB
- Cache scene embeddings for matching
- API endpoints: `POST /scripts`, `GET /scenes/:id`

### Phase 3: Browser Agents

**3.1 Base Browser Agent (Browserbase)**
- Browserbase SDK setup for managed browser sessions
- Built-in proxy rotation and anti-detection
- Session recording and debugging via Browserbase dashboard
- Parallel session management (up to 5 concurrent)

**3.2 Source-Specific Agents** (Priority: Airbnb + Google Maps)

| Source | Data Extracted | Priority |
|--------|---------------|----------|
| Airbnb | Images, address, price/night, amenities, host contact | Primary |
| Google Maps | Photos, address, reviews, business hours | Primary |
| Google Images | Visual reference images for locations | Primary |

**3.3 Location Memory**
- Store all scraped data
- Download and cache images locally
- Extract coordinates for map display

### Phase 4: Gemini Multimodal Matching

**4.1 Matching Agent**
- For each scene-location pair:
  - Send scene description + location images to Gemini
  - Request structured scoring (0-100) with reasoning
  - Score dimensions: visual match, functional fit, logistics

**4.2 Match Memory**
- Cache all scores
- Track which scenes each location satisfies
- Prioritization logic (best matches first)

**4.3 Matching Prompt Template**
```
You are a location scout for film production.

SCENE REQUIREMENTS:
{scene_description}
- Type: {int_ext}
- Mood: {mood}
- Period: {period}
- Key features: {features}

LOCATION:
[Images attached]
{location_description}

Rate this location for this scene (0-100) across:
1. Visual Match: How well does it match the visual style?
2. Functional Fit: Does it have required features/space?
3. Logistics: Accessibility, parking, filming feasibility?

Provide overall score and brief reasoning.
```

### Phase 5: Vapi Voice Agent

**5.1 Vapi Setup**
- Create Vapi account and API key
- Define assistant with filming inquiry persona
- Configure voice (professional, friendly)

**5.2 Call Scripts**
- Initial inquiry: availability, fees, restrictions
- Follow-up: specific dates, requirements
- Handle common objections/questions

**5.3 Outreach Flow**
```
1. Agent initiates call via Vapi API
2. Vapi handles real-time conversation
3. Webhook receives call transcript + summary
4. Extract: availability, price, restrictions, next steps
5. Update outreach memory
```

**5.4 Vapi Assistant Prompt**
```
You are calling on behalf of a film production company
looking for filming locations.

Your goal:
1. Confirm this is {location_name}
2. Ask if they allow filming/photography
3. Get pricing (hourly/daily rates)
4. Ask about restrictions (noise, crew size, equipment)
5. Check availability for {preferred_dates}
6. Get best contact method for follow-up

Be professional, concise, and friendly.
```

### Phase 6: Dashboard Frontend

**6.1 Core Components**
- Script upload with drag-drop
- Scene list with visual requirements display
- Location gallery with match scores
- Map view with all locations plotted
- Outreach status panel

**6.2 Real-time Updates**
- SSE connection to backend
- Live updates as agents find locations
- Progress indicators for active searches

**6.3 Export Features**
- Export to Excel/CSV
- Export to Google Sheets
- PDF report generation

### Phase 7: Integration & Polish

**7.1 Orchestrator**
- Coordinate all agents
- Manage concurrent browser sessions (max 3-5)
- Queue and prioritize tasks
- Handle failures gracefully

**7.2 Demo Mode**
- Pre-seeded script and locations
- Simulated search delay for drama
- Sample Vapi call recording

---

## Database Schema (Supabase SQL)

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Scripts table
create table scripts (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  content text not null,
  created_at timestamptz default now()
);

-- Scenes table
create table scenes (
  id uuid primary key default uuid_generate_v4(),
  script_id uuid references scripts(id) on delete cascade,
  slugline text,                    -- INT. COFFEE SHOP - DAY
  int_ext text,                     -- interior/exterior
  time_of_day text,
  description text,
  mood text,
  period text,
  requirements jsonb default '[]',  -- List of requirements
  scene_number int,
  created_at timestamptz default now()
);

-- Locations table
create table locations (
  id uuid primary key default uuid_generate_v4(),
  source text,                      -- airbnb, google_maps, etc.
  source_id text,
  name text,
  address text,
  coordinates jsonb,                -- {"lat": float, "lng": float}
  description text,
  images jsonb default '[]',        -- List of image URLs
  price text,
  amenities jsonb default '[]',     -- List of amenities
  contact jsonb,                    -- {"name": str, "phone": str, "email": str}
  source_url text,
  scraped_at timestamptz default now()
);

-- Match scores table
create table match_scores (
  id uuid primary key default uuid_generate_v4(),
  scene_id uuid references scenes(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  visual_score int,
  functional_score int,
  logistics_score int,
  overall_score int,
  reasoning text,
  scored_at timestamptz default now()
);

-- Outreach logs table
create table outreach_logs (
  id uuid primary key default uuid_generate_v4(),
  location_id uuid references locations(id) on delete cascade,
  type text,                        -- call, email
  status text,                      -- pending, completed, failed
  vapi_call_id text,
  transcript text,
  summary jsonb,                    -- Extracted info
  availability text,
  quoted_price text,
  restrictions text,
  next_steps text,
  called_at timestamptz default now()
);

-- Enable Row Level Security (optional for MVP)
alter table scripts enable row level security;
alter table scenes enable row level security;
alter table locations enable row level security;
alter table match_scores enable row level security;
alter table outreach_logs enable row level security;

-- Create indexes for common queries
create index idx_scenes_script_id on scenes(script_id);
create index idx_match_scores_scene_id on match_scores(scene_id);
create index idx_match_scores_location_id on match_scores(location_id);
create index idx_outreach_logs_location_id on outreach_logs(location_id);
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/scripts` | Upload and parse script |
| GET | `/api/scripts/:id` | Get script with scenes |
| GET | `/api/scenes` | List all scenes |
| PATCH | `/api/scenes/:id` | Update scene requirements |
| POST | `/api/search` | Start browser agents for scene(s) |
| GET | `/api/locations` | List all found locations |
| GET | `/api/locations/:id` | Get location details |
| POST | `/api/match` | Score location against scene |
| POST | `/api/outreach/call` | Initiate Vapi call |
| POST | `/api/outreach/email` | Send inquiry email |
| GET | `/api/events` | SSE stream for real-time updates |
| GET | `/api/export/excel` | Export results to Excel |
| GET | `/api/export/sheets` | Export to Google Sheets |

---

## Environment Variables

```env
# Server
PORT=8000

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# Google Gemini
GEMINI_API_KEY=

# Vapi Voice
VAPI_API_KEY=
VAPI_ASSISTANT_ID=

# Browserbase
BROWSERBASE_API_KEY=
BROWSERBASE_PROJECT_ID=

# Optional: Google Sheets export
GOOGLE_SHEETS_CREDENTIALS=
```

---

## Key Files to Create First

1. `pyproject.toml` - Python dependencies (using uv)
2. `app/main.py` - FastAPI entry point
3. `app/config.py` - Pydantic settings config
4. `app/db/supabase.py` - Supabase client setup
5. `app/agents/script_parser.py` - Script parsing with Gemini
6. `app/agents/browser/browserbase.py` - Browserbase client wrapper
7. `app/agents/matcher.py` - Gemini multimodal matching
8. `app/agents/voice/vapi_client.py` - Vapi integration
9. `web/src/App.tsx` - Main React app
10. `web/src/components/Dashboard.tsx` - Results dashboard
11. `supabase/migrations/001_initial.sql` - Database schema

---

## Verification / Demo Flow

1. **Start servers**: `uv run uvicorn app.main:app --reload` + `pnpm dev` (backend + frontend)
2. **Upload script**: Drag sample script to upload zone
3. **Watch parsing**: SSE updates as Gemini extracts scenes
4. **Trigger search**: Click "Find Locations" for a scene
5. **Monitor agents**: Watch locations appear in real-time
6. **Review matches**: See Gemini scores with reasoning
7. **Initiate call**: Click "Call" on a location, hear Vapi agent
8. **View results**: Full dashboard with map, images, scores
9. **Export**: Download Excel report

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Airbnb blocking | Browserbase handles anti-detection, proxies, fingerprinting |
| Gemini rate limits | Queue with backoff, cache aggressively |
| Vapi costs | Demo mode with mock calls, limit to 5 real calls |
| Slow scraping | Browserbase parallel sessions (up to 5), progressive loading |

---

## Hackathon Demo Script (3 min)

**0:00** - "Location scouting takes weeks. We built an AI that does it in minutes."

**0:15** - Upload script → show scene extraction in real-time

**0:45** - Browser agents fan out → locations populate with images

**1:30** - Show Gemini matching scores with visual reasoning

**2:00** - Trigger Vapi call → play live or recorded demo call

**2:30** - Dashboard view: map + gallery + export

**2:45** - "3 weeks of work → 3 minutes. Questions?"

---

## Sample Demo Script

Will include a short film script excerpt with 4 diverse scenes:

```
FADE IN:

EXT. ABANDONED WAREHOUSE DISTRICT - NIGHT

Rain falls on cracked pavement. MAYA (30s) walks alone past
rusted shipping containers and graffiti-covered walls.

                    MAYA (V.O.)
          Sometimes you have to get lost to
          find what you're looking for.

INT. UPSCALE COFFEE SHOP - DAY

Warm lighting. Exposed brick. JAMES (40s) sits at a reclaimed
wood table, laptop open, espresso untouched. Maya enters.

                    JAMES
          You're late.

                    MAYA
          Traffic.

EXT. BEACH HOUSE DECK - SUNSET

Waves crash below. Maya and James stand at a weathered railing,
golden light on their faces. A bottle of wine between them.

                    JAMES
          So what happens now?

INT. VINTAGE APARTMENT - MORNING

Sunlight streams through tall windows with original moldings.
Maya wakes in a brass bed, disoriented. 1950s decor surrounds her.

                    MAYA
          Where am I?

FADE OUT.
```

**Extracted Requirements:**
| Scene | Type | Mood | Key Features |
|-------|------|------|--------------|
| Warehouse District | EXT/Night | Dark, gritty, urban | Industrial, graffiti, wet pavement |
| Coffee Shop | INT/Day | Warm, upscale | Exposed brick, reclaimed wood, modern |
| Beach House | EXT/Sunset | Romantic, contemplative | Ocean view, deck, weathered wood |
| Vintage Apartment | INT/Morning | Nostalgic, surreal | Tall windows, brass bed, 1950s decor |
