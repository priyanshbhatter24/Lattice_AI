# Product Requirements Document (PRD)
## Location Scout AI

**Version:** 1.0
**Date:** January 2025
**Status:** Draft

---

## 1. Executive Summary

Location Scout AI is an autonomous agent system that revolutionizes film production location scouting. By combining script analysis, web-scale location search, visual matching, and automated outreach, the platform reduces weeks of manual scouting work to minutes.

### The Problem

Location scouting in film production is:
- **Slow**: Takes 2-4 weeks per project
- **Manual**: Requires physical site visits, endless phone calls, permit research
- **Expensive**: Location managers bill $500-1500/day
- **Limited**: Human scouts can only evaluate ~10-20 locations per day
- **Inconsistent**: Quality depends heavily on scout's network and experience

### The Solution

An AI-powered system that:
1. **Understands scripts** - Extracts scenes and visual requirements automatically
2. **Searches at scale** - Browser agents explore Airbnb, Google Maps, and location databases
3. **Matches intelligently** - Gemini multimodal AI scores location-scene fit
4. **Handles outreach** - Voice AI agents make inquiry calls automatically
5. **Delivers results** - Clean dashboard with images, scores, contacts, and export

### Key Metrics (Target)

| Metric | Current State | Target |
|--------|---------------|--------|
| Time to scout 10 locations | 3-5 days | 30 minutes |
| Locations evaluated per project | 20-50 | 200+ |
| Cost per location found | $50-100 | $2-5 |
| Outreach calls completed | 10/day (manual) | 50+/hour |

---

## 2. Target Users

### Primary: Independent Film Producers
- Budget: $100K - $5M productions
- Pain: Can't afford dedicated location managers
- Need: Affordable, fast location discovery
- Tech comfort: Medium (uses spreadsheets, basic tools)

### Secondary: Location Managers
- Work on larger productions ($5M+)
- Pain: Repetitive outreach tasks, limited search scope
- Need: Expand search capacity, automate qualification calls
- Tech comfort: High

### Tertiary: Commercial/Ad Production
- Short timelines (days, not weeks)
- Pain: Need locations fast for pitches
- Need: Rapid visual matching for mood boards
- Tech comfort: High

---

## 3. User Stories

### Script Upload & Parsing
```
As a producer,
I want to upload my screenplay
So that the system automatically identifies all locations I need to scout
```

**Acceptance Criteria:**
- Accept .txt, .pdf, .fdx (Final Draft) formats
- Extract all unique locations from script
- Identify INT/EXT, time of day, mood, period
- Parse visual requirements from scene descriptions
- Allow manual editing of extracted requirements

### Location Search
```
As a producer,
I want the system to search multiple sources for matching locations
So that I get comprehensive options without manual searching
```

**Acceptance Criteria:**
- Search Airbnb listings in specified region
- Search Google Maps for business/venue photos
- Run searches in parallel (up to 5 concurrent)
- Show real-time progress as locations are found
- Store images, addresses, prices, contact info

### Visual Matching
```
As a producer,
I want locations scored based on how well they match my scene requirements
So that I can quickly identify the best options
```

**Acceptance Criteria:**
- Score each location 0-100 on: visual match, functional fit, logistics
- Provide reasoning for each score
- Sort results by overall match score
- Allow filtering by minimum score threshold
- Support comparing location to multiple scenes

### Automated Outreach
```
As a producer,
I want the system to call locations and gather availability/pricing
So that I don't spend hours on the phone
```

**Acceptance Criteria:**
- Initiate voice calls via Vapi
- Professional inquiry script (availability, rates, restrictions)
- Record and transcribe all calls
- Extract structured data: price, availability, restrictions
- Update location record with outreach results

### Dashboard & Export
```
As a producer,
I want a clear dashboard showing all found locations
So that I can review options and share with my team
```

**Acceptance Criteria:**
- Grid view with location images
- Map view with all locations plotted
- Filter by scene, score, price, source
- Export to Excel/CSV
- Export to Google Sheets
- Generate PDF report

---

## 4. Feature Specifications

### 4.1 Script Parser

**Input:**
- Raw script text or file upload
- Optional style guide / mood references

**Processing:**
- Use Gemini to analyze screenplay format
- Extract scene headers (sluglines)
- Parse location descriptions for visual cues
- Classify location types (residential, commercial, outdoor, etc.)

**Output:**
```json
{
  "scenes": [
    {
      "scene_number": 1,
      "slugline": "INT. UPSCALE COFFEE SHOP - DAY",
      "int_ext": "interior",
      "time_of_day": "day",
      "description": "Warm lighting. Exposed brick. Reclaimed wood tables.",
      "mood": "warm, upscale, modern",
      "requirements": ["exposed brick", "natural light", "seating for 20+"],
      "location_type": "cafe/restaurant"
    }
  ]
}
```

### 4.2 Browser Agents (Browserbase)

**Architecture:**
- Browserbase for managed browser sessions
- Built-in anti-detection and proxy rotation
- Session recording for debugging

**Airbnb Agent:**
- Search by location + keywords
- Extract: images, address, price/night, amenities, host info
- Handle pagination (up to 50 results per search)
- Respect rate limits (2-3 second delays)

**Google Agent:**
- Google Maps: search venues, extract photos, reviews, hours
- Google Images: visual reference searches
- Extract coordinates for map plotting

**Data Captured Per Location:**
```json
{
  "source": "airbnb",
  "source_id": "12345678",
  "name": "Industrial Loft Downtown",
  "address": "123 Main St, Los Angeles, CA",
  "coordinates": {"lat": 34.0522, "lng": -118.2437},
  "images": ["url1", "url2", "url3"],
  "price": "$350/night",
  "amenities": ["parking", "wifi", "kitchen"],
  "contact": {"method": "airbnb_message"},
  "source_url": "https://airbnb.com/rooms/12345678"
}
```

### 4.3 Gemini Multimodal Matcher

**Input:**
- Scene requirements (text)
- Location images (up to 5 per location)
- Location description

**Scoring Dimensions:**

| Dimension | Weight | Criteria |
|-----------|--------|----------|
| Visual Match | 40% | Aesthetic alignment, architectural style, lighting |
| Functional Fit | 35% | Size, layout, required features present |
| Logistics | 25% | Accessibility, parking, filming feasibility |

**Output:**
```json
{
  "visual_score": 85,
  "functional_score": 70,
  "logistics_score": 90,
  "overall_score": 81,
  "reasoning": "Strong visual match with exposed brick and industrial aesthetic. Space may be slightly small for crew of 15. Excellent street parking and loading access."
}
```

### 4.4 Vapi Voice Agent

**Persona:**
- Name: "Alex from Scout Productions"
- Tone: Professional, friendly, concise
- Goal: Gather filming availability and rates

**Call Script Flow:**
1. Introduction and purpose
2. Confirm speaking with right contact
3. Ask about filming/photography policy
4. Get pricing (hourly/daily rates)
5. Ask about restrictions (noise, crew size, hours)
6. Check availability for target dates
7. Get best follow-up contact method
8. Thank and close

**Data Extracted:**
```json
{
  "allows_filming": true,
  "hourly_rate": "$200/hour",
  "daily_rate": "$1,500/day",
  "restrictions": "No overnight, max 10 people",
  "available_dates": "Weekdays only",
  "contact_name": "Sarah",
  "contact_email": "sarah@venue.com",
  "notes": "Requires 2 weeks advance notice"
}
```

### 4.5 Dashboard

**Views:**

1. **Script View**
   - Uploaded script with highlighted scenes
   - Scene cards with requirements
   - "Find Locations" button per scene

2. **Search Progress View**
   - Active agent status
   - Locations found counter
   - Real-time location cards appearing

3. **Results Gallery**
   - Grid of location cards
   - Each card: image, name, score, price
   - Click to expand details

4. **Map View**
   - All locations plotted
   - Cluster markers for dense areas
   - Click marker to see location card

5. **Location Detail**
   - Full image gallery
   - All scores with reasoning
   - Outreach history
   - "Call Now" / "Email" buttons

6. **Export Panel**
   - Select locations to include
   - Choose format (Excel, Sheets, PDF)
   - Download or get shareable link

---

## 5. Technical Architecture

### Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.11+ / FastAPI |
| Database | Supabase (Postgres) |
| Browser Automation | Browserbase |
| AI - Script/Matching | Google Gemini |
| Voice Agent | Vapi.ai |
| Frontend | React / Vite / Tailwind |
| Real-time | Supabase Realtime + SSE |

### Data Flow

```
┌──────────┐     ┌──────────┐     ┌──────────────┐
│  Script  │────▶│  Gemini  │────▶│    Scenes    │
│  Upload  │     │  Parser  │     │   (Supabase) │
└──────────┘     └──────────┘     └──────────────┘
                                          │
                                          ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Browserbase │────▶│   Scraped    │────▶│   Gemini     │
│   Agents     │     │  Locations   │     │   Matcher    │
└──────────────┘     └──────────────┘     └──────────────┘
                                                  │
                                                  ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Vapi      │────▶│   Outreach   │────▶│  Dashboard   │
│   Calls      │     │    Logs      │     │   (React)    │
└──────────────┘     └──────────────┘     └──────────────┘
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scripts` | POST | Upload and parse script |
| `/api/scripts/{id}` | GET | Get script with scenes |
| `/api/scenes` | GET | List all scenes |
| `/api/scenes/{id}` | PATCH | Update scene requirements |
| `/api/search` | POST | Start browser agents |
| `/api/locations` | GET | List all locations |
| `/api/locations/{id}` | GET | Get location details |
| `/api/match` | POST | Score location vs scene |
| `/api/outreach/call` | POST | Initiate Vapi call |
| `/api/events` | GET | SSE stream for updates |
| `/api/export/excel` | GET | Export to Excel |

---

## 6. Non-Functional Requirements

### Performance
- Script parsing: < 30 seconds for 120-page script
- Location search: 10+ results within 2 minutes
- Matching score: < 5 seconds per location
- Dashboard load: < 2 seconds

### Scalability
- Support 100 concurrent users
- Handle scripts up to 200 pages
- Store 10,000+ locations per project

### Security
- API keys stored in environment variables
- Supabase Row Level Security for multi-tenancy
- No PII stored from voice calls (transcripts only)
- HTTPS everywhere

### Reliability
- Browser agent retry logic (3 attempts)
- Graceful degradation if source unavailable
- Call recording backup to cloud storage

---

## 7. Success Metrics

### Launch Metrics (Month 1)
- 50 scripts processed
- 500 locations found
- 100 outreach calls completed
- 80% user task completion rate

### Growth Metrics (Month 3)
- 500 scripts processed
- 5,000 locations found
- 1,000 outreach calls completed
- 3 paying customers (if monetizing)

### Quality Metrics
- Match score accuracy: 80%+ user agreement
- Outreach success rate: 60%+ calls answered
- Data extraction accuracy: 90%+ fields correct

---

## 8. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Airbnb blocks scraping | Medium | High | Browserbase anti-detection, fallback to Google |
| Gemini rate limits | Low | Medium | Queue with backoff, cache results |
| Vapi call quality issues | Medium | Medium | Call recording review, fallback to email |
| User doesn't understand scores | Medium | Low | Add detailed reasoning, tooltips |
| Slow search results | Medium | Medium | Progressive loading, parallel agents |

---

## 9. Future Roadmap

### Phase 2 (Post-MVP)
- Permit database integration
- Budget estimation per location
- Team collaboration features
- Saved search templates

### Phase 3
- Mobile app for on-site scouting
- AR visualization (see scene in location)
- Integration with production management tools
- Multi-language script support

### Phase 4
- Marketplace for location owners
- Direct booking integration
- Insurance/contract generation
- Full production planning suite

---

## 10. Appendix

### A. Competitive Landscape

| Competitor | Strengths | Weaknesses |
|------------|-----------|------------|
| Giggster | Large location database | No script analysis, manual search |
| Peerspace | Easy booking | Limited to their inventory |
| Wrapal | Industry network | Expensive, manual process |
| LocationsHub | UK/EU focus | No AI, dated interface |

**Our Differentiator:** End-to-end automation from script to outreach. No other tool combines AI script understanding + autonomous web search + voice outreach.

### B. Sample Demo Script

```
FADE IN:

EXT. ABANDONED WAREHOUSE DISTRICT - NIGHT

Rain falls on cracked pavement. MAYA (30s) walks alone past
rusted shipping containers and graffiti-covered walls.

INT. UPSCALE COFFEE SHOP - DAY

Warm lighting. Exposed brick. JAMES (40s) sits at a reclaimed
wood table, laptop open, espresso untouched.

EXT. BEACH HOUSE DECK - SUNSET

Waves crash below. Maya and James stand at a weathered railing,
golden light on their faces.

INT. VINTAGE APARTMENT - MORNING

Sunlight streams through tall windows with original moldings.
Maya wakes in a brass bed, disoriented. 1950s decor surrounds her.

FADE OUT.
```

### C. Glossary

- **Slugline**: Scene header in screenplay format (e.g., "INT. COFFEE SHOP - DAY")
- **INT/EXT**: Interior or Exterior location indicator
- **Location Scout**: Person who finds and evaluates filming locations
- **Recce**: Site visit to evaluate a potential location
- **Permit**: Legal authorization to film at a location
