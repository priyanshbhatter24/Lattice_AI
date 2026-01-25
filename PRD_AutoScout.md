# Product Requirements Document (PRD)
# AutoScout: AI-Powered Location Scouting Agent

**Version:** 1.0
**Date:** January 24, 2026
**Author:** Product & Architecture Team
**Status:** Draft for Review

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Solution Overview](#3-solution-overview)
4. [System Architecture](#4-system-architecture)
5. [Detailed Workflow Stages](#5-detailed-workflow-stages)
6. [Data Schema](#6-data-schema)
7. [API Definitions](#7-api-definitions)
8. [Edge Cases & Error Handling](#8-edge-cases--error-handling)
9. [Tech Stack Recommendations](#9-tech-stack-recommendations)
10. [Success Metrics](#10-success-metrics)
11. [Risks & Mitigations](#11-risks--mitigations)
12. [Appendix](#12-appendix)

---

## 1. Executive Summary

**AutoScout** is an end-to-end AI-powered location scouting solution designed to revolutionize how film and television productions discover, evaluate, and book filming locations. By combining script analysis AI, geolocation services, voice AI negotiation, and human-in-the-loop approval workflows, AutoScout reduces the traditional 2-4 week location scouting process to hours.

### Key Value Propositions
- **80% reduction** in manual location scouting time
- **Automated outreach** to venue owners via AI-powered voice calls
- **Structured data capture** from negotiations (pricing, availability, constraints)
- **Human oversight** maintained through approval workflows before final booking

---

## 2. Problem Statement

### Current Pain Points
| Pain Point | Impact |
|------------|--------|
| Manual script reading for location needs | 4-8 hours per script |
| Individual venue research via Google/Yelp | 20-40 hours per production |
| Cold calling venues for availability | High rejection, low response rates |
| Inconsistent data collection from calls | Lost information, repeated calls |
| No centralized tracking system | Spreadsheet chaos, missed opportunities |

### Target Users
- **Primary:** Location Managers, Production Coordinators
- **Secondary:** Line Producers, Unit Production Managers
- **Tertiary:** Independent Filmmakers

---

## 3. Solution Overview

AutoScout implements a **four-stage agentic pipeline** that transforms a raw script into bookable, verified location options with negotiated terms.

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   STAGE 1   │───▶│   STAGE 2   │───▶│   STAGE 3   │───▶│   STAGE 4   │
│   Script    │    │  Grounding  │    │    Vapi     │    │  Dashboard  │
│  Analysis   │    │  Discovery  │    │ Negotiation │    │ Fulfillment │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      ▲                                                         │
      │              Human-in-the-Loop Approval                 │
      └─────────────────────────────────────────────────────────┘
```

---

## 4. System Architecture

### 4.1 Architecture Diagram Description

The AutoScout system follows a **Planner-Executor** microservices architecture with clear separation of concerns:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                     Next.js Frontend Dashboard                           │ │
│  │  • Script Upload UI    • Location Cards    • Call Playback Player       │ │
│  │  • Approval Workflow   • Booking Confirmation   • Project Management    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY LAYER                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                        Next.js API Routes                                │ │
│  │     /api/scripts    /api/locations    /api/calls    /api/bookings       │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         ORCHESTRATION LAYER (SIM.AI)                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         Sim Agent Workflows                              │ │
│  │                                                                          │ │
│  │  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐            │ │
│  │  │ Script Parser │───▶│ Location      │───▶│ Call          │            │ │
│  │  │ Agent         │    │ Matcher Agent │    │ Orchestrator  │            │ │
│  │  │               │    │               │    │ Agent         │            │ │
│  │  │ • PDF Extract │    │ • Query Build │    │ • Vapi Trigger│            │ │
│  │  │ • Scene Parse │    │ • Ranking     │    │ • Result Parse│            │ │
│  │  │ • Vibe Detect │    │ • Filtering   │    │ • Retry Logic │            │ │
│  │  └───────────────┘    └───────────────┘    └───────────────┘            │ │
│  │         │                    │                    │                      │ │
│  │         ▼                    ▼                    ▼                      │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │ │
│  │  │              Sim Tool Registry & Function Calling               │    │ │
│  │  └─────────────────────────────────────────────────────────────────┘    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
           ┌──────────────────────────┼──────────────────────────┐
           ▼                          ▼                          ▼
┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐
│  GOOGLE MAPS API   │   │      VAPI.AI       │   │   EMAIL SERVICE    │
│  (Places New)      │   │   (Voice Agent)    │   │   (SendGrid)       │
│                    │   │                    │   │                    │
│ • Text Search      │   │ • Outbound Calls   │   │ • Booking Confirm  │
│ • Place Details    │   │ • Context Inject   │   │ • Follow-up Emails │
│ • Photos API       │   │ • Call Recording   │   │ • Receipts         │
│ • Phone Numbers    │   │ • Webhook Callback │   │                    │
└────────────────────┘   └────────────────────┘   └────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                             DATA LAYER                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐   │
│  │                            Supabase                                     │   │
│  │                                                                         │   │
│  │  • PostgreSQL Database (Projects, Locations, Calls, Bookings)          │   │
│  │  • Storage (Script PDFs, Call Recordings, Location Photos)             │   │
│  │  • Auth (User Management)                                               │   │
│  │  • Realtime (Live call status updates)                                  │   │
│  │                                                                         │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Component Interaction Flow

#### Data Flow Sequence

```
1. USER uploads script.pdf to Frontend
                    │
                    ▼
2. Frontend POSTs to /api/scripts/analyze
                    │
                    ▼
3. API Gateway triggers SIM workflow: "script_analysis_pipeline"
                    │
                    ▼
4. SIM Agent (Script Parser):
   ├── Extracts text from PDF (PyMuPDF)
   ├── Identifies scenes using LLM (Claude/GPT-4)
   ├── Classifies "vibe" per scene
   ├── Extracts physical constraints
   └── Outputs: LocationRequirement[]
                    │
                    ▼
5. SIM Agent (Location Matcher):
   ├── Builds semantic search queries
   ├── Calls Google Maps Places API (Text Search)
   ├── Filters by constraints (hours, size, reviews)
   ├── Retrieves phone numbers via Place Details
   └── Outputs: LocationCandidate[]
                    │
                    ▼
6. SIM Agent (Call Orchestrator):
   ├── Prioritizes candidates by match score
   ├── Triggers Vapi outbound calls with context
   ├── Listens for webhook callbacks
   └── Updates LocationCandidate with call results
                    │
                    ▼
7. VAPI executes call:
   ├── Introduces purpose (film location inquiry)
   ├── Asks about availability
   ├── Asks about pricing
   ├── Captures manager name
   ├── Identifies red flags
   └── POSTs results to /api/webhooks/vapi
                    │
                    ▼
8. Frontend displays LocationCandidate cards with:
   ├── Photos from Google
   ├── Vapi call summary
   ├── Audio playback option
   └── "Approve & Book" button
                    │
                    ▼
9. USER clicks "Approve & Book"
                    │
                    ▼
10. System sends confirmation email via SendGrid
```

### 4.3 Sim.ai Orchestration Deep Dive

Sim.ai serves as the **central nervous system** of AutoScout, providing:

| Capability | Implementation |
|------------|----------------|
| **Workflow Orchestration** | Multi-step agent pipelines with branching logic |
| **Tool Integration** | Native function calling to Google Maps, Vapi APIs |
| **State Management** | Persistent workflow state across async operations |
| **Error Recovery** | Automatic retries with exponential backoff |
| **Human-in-the-Loop** | Pause points for approval before critical actions |

#### Sim Workflow Definition (Pseudocode)

```yaml
workflow: autoscout_main
triggers:
  - event: script.uploaded
    condition: file.type in ['pdf', 'txt', 'fdx']

steps:
  - id: parse_script
    agent: script_parser
    tools:
      - pdf_extractor
      - scene_identifier
      - vibe_classifier
    outputs:
      - location_requirements[]

  - id: discover_locations
    agent: location_matcher
    for_each: location_requirements
    tools:
      - google_places_search
      - google_place_details
    outputs:
      - location_candidates[]

  - id: filter_and_rank
    agent: ranking_engine
    inputs: location_candidates
    logic: |
      filter: has_phone_number == true
      rank_by:
        - match_score DESC
        - review_count DESC
        - distance ASC
    outputs:
      - ranked_candidates[]

  - id: initiate_calls
    agent: call_orchestrator
    for_each: ranked_candidates[0:5]  # Top 5 per scene
    tools:
      - vapi_outbound_call
    async: true
    webhook: /api/webhooks/vapi

  - id: await_human_approval
    type: human_checkpoint
    ui: dashboard.locations
    actions:
      - approve_booking
      - reject_candidate
      - request_manual_call

  - id: send_confirmation
    agent: fulfillment_agent
    condition: action == 'approve_booking'
    tools:
      - sendgrid_email
    template: booking_confirmation
```

---

## 5. Detailed Workflow Stages

### 5.1 Stage 1: Agentic Script Analysis

#### Purpose
Transform unstructured screenplay content into structured location requirements.

#### Input Specification
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `script_file` | File | Yes | PDF, TXT, or FDX format |
| `project_name` | String | Yes | Production working title |
| `target_city` | String | No | Default: "Los Angeles, CA" |
| `crew_size` | Integer | No | Default: 20 |
| `filming_dates` | DateRange | No | Preferred filming window |

#### Processing Logic

```
1. TEXT EXTRACTION
   ├── PDF → PyMuPDF (fitz) extraction
   ├── FDX → XML parsing (Final Draft format)
   └── TXT → Direct read

2. SCENE IDENTIFICATION
   ├── Regex patterns for scene headers: INT./EXT. LOCATION - TIME
   ├── LLM-based scene boundary detection for edge cases
   └── Deduplication of repeated locations

3. VIBE CLASSIFICATION
   ├── LLM prompt: "Classify the visual aesthetic of this scene..."
   ├── Categories: industrial, luxury, suburban, urban-gritty,
   │               natural, retro-vintage, futuristic, institutional
   └── Confidence score (0-1)

4. CONSTRAINT EXTRACTION
   ├── Physical: ceiling_height, floor_space, parking, accessibility
   ├── Temporal: day/night, season indicators
   ├── Acoustic: dialogue-heavy (quiet needed), action (noise OK)
   └── Special: water features, rooftop access, period-specific
```

#### Output: `LocationRequirement`
```json
{
  "scene_id": "SC_012",
  "scene_header": "INT. ABANDONED WAREHOUSE - NIGHT",
  "page_numbers": [23, 24, 25],
  "vibe": {
    "primary": "industrial",
    "secondary": "urban-gritty",
    "descriptors": ["1980s aesthetic", "brick walls", "high ceilings"],
    "confidence": 0.87
  },
  "constraints": {
    "interior_exterior": "interior",
    "time_of_day": "night",
    "min_ceiling_height_ft": 20,
    "min_floor_space_sqft": 5000,
    "parking_spaces_needed": 15,
    "power_requirements": "standard_120v",
    "acoustic_needs": "dialogue_heavy",
    "special_requirements": ["large windows", "concrete floors"]
  },
  "script_context": "Chase scene culminating in confrontation...",
  "estimated_shoot_duration_hours": 12
}
```

### 5.2 Stage 2: Grounding & Discovery

#### Purpose
Transform abstract location requirements into concrete, contactable real-world venues.

#### Google Maps Places API (New) Integration

##### Text Search Query Construction

```python
def build_search_query(requirement: LocationRequirement) -> str:
    """
    Constructs optimized Google Places text search query.
    """
    vibe_mappings = {
        "industrial": ["warehouse", "factory", "industrial space", "loft"],
        "luxury": ["luxury hotel", "mansion", "upscale restaurant", "penthouse"],
        "urban-gritty": ["dive bar", "bodega", "parking garage", "alley"],
        "suburban": ["suburban home", "strip mall", "diner", "community center"],
        "institutional": ["hospital", "school", "government building", "library"]
    }

    base_terms = vibe_mappings.get(requirement.vibe.primary, [])

    # Add constraint modifiers
    if requirement.constraints.min_ceiling_height_ft > 15:
        base_terms = [f"large {term}" for term in base_terms]

    return " OR ".join(base_terms)
```

##### API Call Sequence

```
1. TEXT SEARCH (New Places API)
   POST https://places.googleapis.com/v1/places:searchText
   Headers:
     X-Goog-Api-Key: {API_KEY}
     X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,
                       places.location,places.photos,places.rating,
                       places.userRatingCount,places.regularOpeningHours
   Body:
     {
       "textQuery": "industrial warehouse film location",
       "locationBias": {
         "circle": {
           "center": {"latitude": 34.0522, "longitude": -118.2437},
           "radius": 50000.0
         }
       },
       "maxResultCount": 20
     }

2. PLACE DETAILS (for each result - to get phone number)
   GET https://places.googleapis.com/v1/places/{place_id}
   Headers:
     X-Goog-FieldMask: nationalPhoneNumber,internationalPhoneNumber,
                       websiteUri,currentOpeningHours,priceLevel

3. PHOTOS (for display)
   GET https://places.googleapis.com/v1/{photo_name}/media
     ?maxHeightPx=800
     &maxWidthPx=1200
```

#### Ranking Algorithm

```python
def calculate_match_score(candidate: dict, requirement: LocationRequirement) -> float:
    """
    Multi-factor ranking score for location candidates.
    """
    score = 0.0

    # Vibe match (40% weight)
    vibe_keywords = requirement.vibe.descriptors
    description = candidate.get("editorial_summary", "").lower()
    vibe_matches = sum(1 for kw in vibe_keywords if kw.lower() in description)
    score += (vibe_matches / len(vibe_keywords)) * 0.40

    # Has phone number (25% weight) - critical for Stage 3
    if candidate.get("phone_number"):
        score += 0.25

    # Review quality (20% weight)
    rating = candidate.get("rating", 0)
    review_count = candidate.get("user_ratings_total", 0)
    if rating >= 4.0 and review_count >= 50:
        score += 0.20
    elif rating >= 3.5:
        score += 0.10

    # Distance from city center (15% weight)
    distance_km = candidate.get("distance_from_center", 100)
    if distance_km < 10:
        score += 0.15
    elif distance_km < 25:
        score += 0.10
    elif distance_km < 50:
        score += 0.05

    return round(score, 3)
```

### 5.3 Stage 3: Vapi Negotiation Layer

#### Purpose
Automate initial venue outreach via AI-powered voice calls, extracting structured negotiation data.

#### Vapi Configuration

##### Assistant Definition

```json
{
  "name": "AutoScout Location Agent",
  "model": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "temperature": 0.7,
    "systemPrompt": "You are a professional location scout for film and television productions. You are calling venues to inquire about availability for filming. Be polite, professional, and efficient. Your goals are to: 1) Confirm if the venue is available for filming, 2) Get a price estimate for the duration needed, 3) Get the name of the decision-maker, 4) Identify any restrictions or red flags. Do not commit to booking - only gather information."
  },
  "voice": {
    "provider": "11labs",
    "voiceId": "rachel",
    "stability": 0.5,
    "similarityBoost": 0.75
  },
  "firstMessage": "Hello! My name is Alex and I'm calling from {{production_company}}. We're currently scouting locations for an upcoming production called {{project_name}}, and we came across your venue. Do you have a moment to discuss potential filming availability?",
  "recordingEnabled": true,
  "endCallFunctionEnabled": true,
  "serverUrl": "https://autoscout.app/api/webhooks/vapi"
}
```

##### Context Injection Variables

```json
{
  "production_company": "Meridian Pictures",
  "project_name": "Night Shift",
  "filming_dates": "March 15-17, 2026",
  "duration_description": "two full days, approximately 12 hours each",
  "crew_size": 25,
  "equipment_description": "standard film equipment including lights and cameras",
  "scene_description": "an interior dialogue scene, minimal noise and action",
  "specific_requirements": ["access to loading dock", "available parking for 10 vehicles"]
}
```

##### Vapi Call Trigger

```javascript
// POST to Vapi API
const triggerCall = async (phoneNumber, context) => {
  const response = await fetch('https://api.vapi.ai/call/phone', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VAPI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      assistantId: AUTOSCOUT_ASSISTANT_ID,
      phoneNumberId: OUTBOUND_PHONE_NUMBER_ID,
      customer: {
        number: phoneNumber
      },
      assistantOverrides: {
        variableValues: context
      },
      metadata: {
        location_candidate_id: context.candidate_id,
        project_id: context.project_id,
        scene_id: context.scene_id
      }
    })
  });

  return response.json();
};
```

#### Vapi Extraction Schema

The Vapi assistant is configured to extract structured data during the call:

```json
{
  "extractionSchema": {
    "type": "object",
    "properties": {
      "venue_available": {
        "type": "boolean",
        "description": "Whether the venue is available for filming"
      },
      "availability_details": {
        "type": "string",
        "description": "Specific dates or times mentioned as available"
      },
      "price_quoted": {
        "type": "number",
        "description": "Price quoted in USD"
      },
      "price_unit": {
        "type": "string",
        "enum": ["hourly", "half_day", "full_day", "flat_fee"],
        "description": "Unit for the quoted price"
      },
      "decision_maker_name": {
        "type": "string",
        "description": "Name of the person who can approve bookings"
      },
      "decision_maker_title": {
        "type": "string",
        "description": "Title or role of the decision maker"
      },
      "callback_required": {
        "type": "boolean",
        "description": "Whether they requested a callback"
      },
      "callback_details": {
        "type": "string",
        "description": "When or how to call back"
      },
      "red_flags": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Any restrictions, concerns, or dealbreakers mentioned"
      },
      "additional_notes": {
        "type": "string",
        "description": "Any other relevant information from the call"
      }
    }
  }
}
```

#### Webhook Callback Handler

```typescript
// /api/webhooks/vapi/route.ts
interface VapiWebhookPayload {
  message: {
    type: 'end-of-call-report' | 'status-update' | 'transcript';
    call: {
      id: string;
      status: 'queued' | 'ringing' | 'in-progress' | 'ended';
      endedReason?: 'assistant-ended' | 'customer-ended' | 'voicemail' |
                    'no-answer' | 'busy' | 'failed';
      duration: number;
      recordingUrl?: string;
      transcript?: string;
      analysis?: {
        structuredData: ExtractedCallData;
        summary: string;
        successEvaluation: boolean;
      };
    };
    metadata: {
      location_candidate_id: string;
      project_id: string;
      scene_id: string;
    };
  };
}

export async function POST(request: Request) {
  const payload: VapiWebhookPayload = await request.json();

  if (payload.message.type === 'end-of-call-report') {
    const { call, metadata } = payload.message;

    // Update LocationCandidate in database
    await db.locationCandidate.update({
      where: { id: metadata.location_candidate_id },
      data: {
        vapi_call_status: mapCallStatus(call.status, call.endedReason),
        vapi_call_id: call.id,
        vapi_call_duration: call.duration,
        vapi_recording_url: call.recordingUrl,
        vapi_transcript: call.transcript,
        negotiated_price: call.analysis?.structuredData?.price_quoted,
        price_unit: call.analysis?.structuredData?.price_unit,
        manager_name: call.analysis?.structuredData?.decision_maker_name,
        venue_available: call.analysis?.structuredData?.venue_available,
        red_flags: call.analysis?.structuredData?.red_flags,
        call_summary: call.analysis?.summary,
        updated_at: new Date()
      }
    });

    // Frontend receives update automatically via Supabase Realtime
    // (subscribed to postgres_changes on location_candidates table)
  }

  return new Response('OK', { status: 200 });
}
```

### 5.4 Stage 4: Frontend Dashboard & Fulfillment

#### User Interface Components

##### Project Dashboard

```
┌─────────────────────────────────────────────────────────────────────┐
│  AutoScout Dashboard                              [User] ▼  [Help]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Project: "Night Shift"                          Status: Scouting   │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  [Scene Tabs: Warehouse | Diner | Apartment | Rooftop | All]        │
│                                                                     │
│  ┌─── Scene: INT. WAREHOUSE - NIGHT ───────────────────────────┐   │
│  │                                                               │   │
│  │  Requirements: Industrial, 20ft+ ceilings, 5000 sqft         │   │
│  │  Candidates Found: 8  │  Calls Completed: 5  │  Pending: 2   │   │
│  │                                                               │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │   │
│  │  │ [Photo]      │  │ [Photo]      │  │ [Photo]      │        │   │
│  │  │              │  │              │  │              │        │   │
│  │  │ Arts Dist.   │  │ Westside     │  │ Vernon       │        │   │
│  │  │ Warehouse    │  │ Studios      │  │ Industrial   │        │   │
│  │  ├──────────────┤  ├──────────────┤  ├──────────────┤        │   │
│  │  │ ✓ Available  │  │ ✓ Available  │  │ ⏳ Pending   │        │   │
│  │  │ $2,500/day   │  │ $4,000/day   │  │ Call in...   │        │   │
│  │  │ Contact: Mike│  │ Contact: Sara│  │              │        │   │
│  │  │ ⚠️ No parking │  │ ✓ No issues  │  │              │        │   │
│  │  ├──────────────┤  ├──────────────┤  ├──────────────┤        │   │
│  │  │[▶️ Listen]    │  │[▶️ Listen]    │  │              │        │   │
│  │  │[Approve ✓]   │  │[Approve ✓]   │  │              │        │   │
│  │  │[Reject ✗]    │  │[Reject ✗]    │  │[Manual Call] │        │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘        │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

##### Location Detail Modal

```
┌─────────────────────────────────────────────────────────────────────┐
│  Arts District Warehouse                                    [X]     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────┐  Address: 1234 Industrial Blvd            │
│  │                     │           Los Angeles, CA 90021            │
│  │     [Photo Grid]    │                                            │
│  │                     │  Phone: (213) 555-0147                     │
│  │  ◄ 1/5 ►           │  Website: artsdistrictwarehouse.com        │
│  └─────────────────────┘                                            │
│                                                                     │
│  ─── Vapi Call Report ──────────────────────────────────────────    │
│                                                                     │
│  Call Status: ✓ Completed (3m 42s)                                  │
│  Call Date: Jan 23, 2026 at 2:34 PM                                │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Audio Player: [▶️ Play Recording]  ━━━━━━━━○━━━━  3:42      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Summary:                                                           │
│  "Spoke with Mike, the facilities manager. Venue is available on   │
│   requested dates. Quoted $2,500/day for 12-hour access.           │
│   Includes loading dock access. Note: Street parking only,         │
│   no on-site parking available."                                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Extracted Data:                                              │   │
│  │ • Available: Yes                                             │   │
│  │ • Price: $2,500/day                                          │   │
│  │ • Contact: Mike (Facilities Manager)                         │   │
│  │ • Red Flags: No on-site parking                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Transcript:                                                  │   │
│  │ Agent: Hello! My name is Alex and I'm calling from...        │   │
│  │ Venue: Hi, this is Mike. How can I help you?                 │   │
│  │ Agent: We're scouting locations for a film called...         │   │
│  │ ...                                           [Show More]    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  [ Cancel ]                    [ Reject Candidate ]  [ Approve ✓ ]  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### Booking Confirmation Flow

```typescript
// Approval action handler
async function handleApproveBooking(candidateId: string, userId: string) {
  const candidate = await db.locationCandidate.findUnique({
    where: { id: candidateId },
    include: { project: true, scene: true }
  });

  // 1. Create booking record
  const booking = await db.booking.create({
    data: {
      locationCandidateId: candidateId,
      projectId: candidate.projectId,
      status: 'pending_confirmation',
      approvedBy: userId,
      approvedAt: new Date(),
      negotiatedPrice: candidate.negotiated_price,
      priceUnit: candidate.price_unit
    }
  });

  // 2. Send confirmation email via SendGrid
  await sendBookingConfirmationEmail({
    to: candidate.manager_email || candidate.venue_email,
    templateId: SENDGRID_BOOKING_TEMPLATE,
    dynamicTemplateData: {
      venue_name: candidate.venue_name,
      manager_name: candidate.manager_name,
      production_name: candidate.project.name,
      production_company: candidate.project.company_name,
      filming_dates: candidate.project.filming_dates,
      confirmed_price: `$${candidate.negotiated_price}/${candidate.price_unit}`,
      producer_name: userId,
      producer_email: user.email,
      producer_phone: user.phone,
      next_steps: "Please reply to confirm these details..."
    }
  });

  // 3. Update candidate status
  await db.locationCandidate.update({
    where: { id: candidateId },
    data: { status: 'booked' }
  });

  return booking;
}
```

#### Email Template Structure

```html
Subject: Location Booking Request - {{production_name}} at {{venue_name}}

Dear {{manager_name}},

Thank you for speaking with our team about filming at {{venue_name}}.

We are pleased to formally request a booking with the following details:

PRODUCTION DETAILS:
• Production: {{production_name}}
• Production Company: {{production_company}}
• Filming Dates: {{filming_dates}}
• Confirmed Rate: {{confirmed_price}}

NEXT STEPS:
Please reply to this email to confirm the booking, or contact us at:
• Producer: {{producer_name}}
• Email: {{producer_email}}
• Phone: {{producer_phone}}

We will follow up with a formal location agreement and certificate of
insurance within 48 hours of confirmation.

Thank you for your partnership!

Best regards,
The {{production_company}} Team

---
This email was sent via AutoScout Location Management System
```

---

## 6. Data Schema

### 6.1 Core Entities

#### Project

```typescript
interface Project {
  id: string;                    // UUID
  name: string;                  // "Night Shift"
  company_name: string;          // "Meridian Pictures"
  script_file_url: string;       // R2 storage URL
  script_text_extracted: string; // Full extracted text
  target_city: string;           // "Los Angeles, CA"
  target_coordinates: {
    latitude: number;
    longitude: number;
  };
  filming_start_date: Date;
  filming_end_date: Date;
  crew_size: number;
  budget_per_location: number;   // Max budget hint
  status: 'draft' | 'analyzing' | 'scouting' | 'booking' | 'complete';
  created_by: string;            // User ID
  created_at: Date;
  updated_at: Date;
}
```

#### Scene (LocationRequirement)

```typescript
interface Scene {
  id: string;                    // UUID
  project_id: string;            // FK to Project
  scene_number: string;          // "SC_012"
  scene_header: string;          // "INT. WAREHOUSE - NIGHT"
  page_numbers: number[];        // [23, 24, 25]
  script_excerpt: string;        // Relevant script text

  // Vibe classification
  vibe: {
    primary: VibeCategory;
    secondary: VibeCategory | null;
    descriptors: string[];       // ["1980s aesthetic", "brick walls"]
    confidence: number;          // 0.0 - 1.0
  };

  // Physical constraints
  constraints: {
    interior_exterior: 'interior' | 'exterior' | 'both';
    time_of_day: 'day' | 'night' | 'both';
    min_ceiling_height_ft: number | null;
    min_floor_space_sqft: number | null;
    parking_spaces_needed: number;
    power_requirements: 'standard_120v' | 'heavy_duty' | 'generator_ok';
    acoustic_needs: 'dialogue_heavy' | 'action_ok' | 'any';
    special_requirements: string[];
  };

  estimated_shoot_hours: number;
  priority: 'critical' | 'important' | 'flexible';
  status: 'pending' | 'scouting' | 'candidates_found' | 'booked';
  created_at: Date;
  updated_at: Date;
}

type VibeCategory =
  | 'industrial'
  | 'luxury'
  | 'urban-gritty'
  | 'suburban'
  | 'natural'
  | 'retro-vintage'
  | 'futuristic'
  | 'institutional'
  | 'commercial'
  | 'residential';
```

#### LocationCandidate (Central Pipeline Object)

```typescript
interface LocationCandidate {
  id: string;                    // UUID
  scene_id: string;              // FK to Scene
  project_id: string;            // FK to Project

  // ─── Google Places Data ───────────────────────────────
  google_place_id: string;       // "ChIJN1t_tDeuEmsRUsoyG83frY4"
  venue_name: string;            // "Arts District Warehouse"
  formatted_address: string;     // "1234 Industrial Blvd, LA, CA 90021"
  latitude: number;
  longitude: number;
  phone_number: string | null;   // "+1-213-555-0147"
  website_url: string | null;
  google_rating: number | null;  // 4.5
  google_review_count: number;   // 127
  price_level: number | null;    // 1-4 scale

  // Photos
  photo_urls: string[];          // URLs to cached photos
  photo_attributions: string[];

  // Opening hours
  opening_hours: {
    weekday_text: string[];
    periods: OpeningPeriod[];
  } | null;

  // Computed fields
  match_score: number;           // 0.0 - 1.0
  distance_from_center_km: number;

  // ─── Vapi Call Data ───────────────────────────────────
  vapi_call_status: VapiCallStatus;
  vapi_call_id: string | null;
  vapi_call_initiated_at: Date | null;
  vapi_call_completed_at: Date | null;
  vapi_call_duration_seconds: number | null;
  vapi_recording_url: string | null;
  vapi_transcript: string | null;

  // Extracted negotiation data
  venue_available: boolean | null;
  availability_details: string | null;
  negotiated_price: number | null;        // e.g., 2500
  price_unit: 'hourly' | 'half_day' | 'full_day' | 'flat_fee' | null;
  manager_name: string | null;            // "Mike Thompson"
  manager_title: string | null;           // "Facilities Manager"
  manager_email: string | null;           // If provided
  manager_direct_phone: string | null;    // If different from main
  callback_required: boolean;
  callback_details: string | null;
  red_flags: string[];                    // ["no parking", "noise restrictions"]
  call_summary: string | null;            // LLM-generated summary
  call_success_score: number | null;      // 0.0 - 1.0

  // ─── Workflow Status ──────────────────────────────────
  status: CandidateStatus;
  rejection_reason: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  booking_id: string | null;             // FK to Booking if approved

  // Metadata
  created_at: Date;
  updated_at: Date;
}

type VapiCallStatus =
  | 'not_initiated'      // Phone number available, call not started
  | 'queued'             // Call request sent to Vapi
  | 'ringing'            // Call is ringing
  | 'in_progress'        // Call connected, conversation happening
  | 'completed'          // Call ended successfully
  | 'voicemail'          // Reached voicemail
  | 'no_answer'          // No answer after ring timeout
  | 'busy'               // Line busy
  | 'failed'             // Technical failure
  | 'no_phone_number';   // Cannot call - no phone number

type CandidateStatus =
  | 'discovered'         // Found via Google Places
  | 'call_pending'       // Queued for Vapi call
  | 'call_in_progress'   // Call happening
  | 'call_completed'     // Call done, awaiting review
  | 'call_failed'        // Call failed, may retry
  | 'human_review'       // Flagged for manual review
  | 'approved'           // User approved
  | 'rejected'           // User rejected
  | 'booked';            // Booking confirmed
```

#### Booking

```typescript
interface Booking {
  id: string;                    // UUID
  location_candidate_id: string; // FK
  project_id: string;            // FK
  scene_id: string;              // FK

  // Confirmed details
  venue_name: string;
  venue_address: string;
  venue_phone: string;
  contact_name: string;
  contact_email: string | null;

  // Booking terms
  confirmed_price: number;
  price_unit: string;
  total_estimated_cost: number;
  filming_dates: DateRange[];
  special_arrangements: string | null;

  // Status tracking
  status: 'pending_confirmation' | 'confirmed' | 'contract_sent' |
          'contract_signed' | 'cancelled';

  // Email tracking
  confirmation_email_sent_at: Date | null;
  confirmation_email_id: string | null;  // SendGrid message ID
  venue_response_received_at: Date | null;
  venue_response: string | null;

  // Approval chain
  approved_by: string;           // User ID
  approved_at: Date;

  created_at: Date;
  updated_at: Date;
}
```

### 6.2 Database Schema (PostgreSQL)

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    script_file_url TEXT,
    script_text_extracted TEXT,
    target_city VARCHAR(255) DEFAULT 'Los Angeles, CA',
    target_latitude DECIMAL(10, 8),
    target_longitude DECIMAL(11, 8),
    filming_start_date DATE,
    filming_end_date DATE,
    crew_size INTEGER DEFAULT 20,
    budget_per_location DECIMAL(10, 2),
    status VARCHAR(50) DEFAULT 'draft',
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scenes table
CREATE TABLE scenes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scene_number VARCHAR(50),
    scene_header VARCHAR(500),
    page_numbers INTEGER[],
    script_excerpt TEXT,
    vibe JSONB,
    constraints JSONB,
    estimated_shoot_hours INTEGER,
    priority VARCHAR(50) DEFAULT 'important',
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Location candidates table
CREATE TABLE location_candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Google Places data
    google_place_id VARCHAR(255),
    venue_name VARCHAR(255) NOT NULL,
    formatted_address TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    phone_number VARCHAR(50),
    website_url TEXT,
    google_rating DECIMAL(2, 1),
    google_review_count INTEGER,
    price_level INTEGER,
    photo_urls TEXT[],
    photo_attributions TEXT[],
    opening_hours JSONB,
    match_score DECIMAL(4, 3),
    distance_from_center_km DECIMAL(6, 2),

    -- Vapi call data
    vapi_call_status VARCHAR(50) DEFAULT 'not_initiated',
    vapi_call_id VARCHAR(255),
    vapi_call_initiated_at TIMESTAMP WITH TIME ZONE,
    vapi_call_completed_at TIMESTAMP WITH TIME ZONE,
    vapi_call_duration_seconds INTEGER,
    vapi_recording_url TEXT,
    vapi_transcript TEXT,

    -- Negotiation data
    venue_available BOOLEAN,
    availability_details TEXT,
    negotiated_price DECIMAL(10, 2),
    price_unit VARCHAR(50),
    manager_name VARCHAR(255),
    manager_title VARCHAR(255),
    manager_email VARCHAR(255),
    manager_direct_phone VARCHAR(50),
    callback_required BOOLEAN DEFAULT FALSE,
    callback_details TEXT,
    red_flags TEXT[],
    call_summary TEXT,
    call_success_score DECIMAL(3, 2),

    -- Status
    status VARCHAR(50) DEFAULT 'discovered',
    rejection_reason TEXT,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    booking_id UUID,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bookings table
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_candidate_id UUID NOT NULL REFERENCES location_candidates(id),
    project_id UUID NOT NULL REFERENCES projects(id),
    scene_id UUID NOT NULL REFERENCES scenes(id),

    venue_name VARCHAR(255) NOT NULL,
    venue_address TEXT,
    venue_phone VARCHAR(50),
    contact_name VARCHAR(255),
    contact_email VARCHAR(255),

    confirmed_price DECIMAL(10, 2),
    price_unit VARCHAR(50),
    total_estimated_cost DECIMAL(10, 2),
    filming_dates JSONB,
    special_arrangements TEXT,

    status VARCHAR(50) DEFAULT 'pending_confirmation',
    confirmation_email_sent_at TIMESTAMP WITH TIME ZONE,
    confirmation_email_id VARCHAR(255),
    venue_response_received_at TIMESTAMP WITH TIME ZONE,
    venue_response TEXT,

    approved_by UUID NOT NULL,
    approved_at TIMESTAMP WITH TIME ZONE NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_scenes_project_id ON scenes(project_id);
CREATE INDEX idx_location_candidates_scene_id ON location_candidates(scene_id);
CREATE INDEX idx_location_candidates_project_id ON location_candidates(project_id);
CREATE INDEX idx_location_candidates_status ON location_candidates(status);
CREATE INDEX idx_location_candidates_vapi_status ON location_candidates(vapi_call_status);
CREATE INDEX idx_bookings_project_id ON bookings(project_id);
CREATE INDEX idx_bookings_status ON bookings(status);
```

### 6.3 LocationCandidate State Machine

```
                                    ┌─────────────────┐
                                    │   discovered    │
                                    └────────┬────────┘
                                             │
                    ┌────────────────────────┴────────────────────────┐
                    │                                                  │
                    ▼                                                  ▼
        ┌───────────────────┐                              ┌──────────────────┐
        │  no_phone_number  │                              │   call_pending   │
        │   (terminal)      │                              └────────┬─────────┘
        └───────────────────┘                                       │
                                                                    ▼
                                                        ┌───────────────────┐
                                                        │  call_in_progress │
                                                        └────────┬──────────┘
                                                                 │
                    ┌─────────────────┬─────────────────┬────────┴────────┐
                    │                 │                 │                  │
                    ▼                 ▼                 ▼                  ▼
        ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌──────────────┐
        │ call_completed│  │   voicemail   │  │   no_answer   │  │ call_failed  │
        └───────┬───────┘  └───────┬───────┘  └───────┬───────┘  └──────┬───────┘
                │                  │                  │                  │
                │                  └─────────┬────────┴──────────────────┘
                │                            │
                ▼                            ▼
        ┌───────────────┐          ┌───────────────┐
        │ human_review  │          │ call_pending  │ (retry with backoff)
        └───────┬───────┘          └───────────────┘
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
┌───────────────┐  ┌───────────────┐
│   approved    │  │   rejected    │
└───────┬───────┘  └───────────────┘
        │               (terminal)
        ▼
┌───────────────┐
│    booked     │
└───────────────┘
    (terminal)
```

---

## 7. API Definitions

### 7.1 Script Analysis API

#### `extract_locations_from_script(script_file)`

```typescript
/**
 * Analyzes a screenplay file to extract location requirements.
 *
 * @param script_file - The uploaded script file (PDF, TXT, or FDX format)
 * @returns Promise<ScriptAnalysisResult>
 *
 * @example
 * const result = await extract_locations_from_script(uploadedFile);
 * // result.scenes contains all identified location requirements
 */

interface ExtractLocationsParams {
  script_file: File;                    // The script file to analyze
  project_id: string;                   // Associated project ID
  options?: {
    target_city?: string;               // Default: "Los Angeles, CA"
    crew_size?: number;                 // Default: 20
    include_script_excerpts?: boolean;  // Default: true
    vibe_detection_model?: 'fast' | 'accurate';  // Default: 'accurate'
  };
}

interface ScriptAnalysisResult {
  success: boolean;
  project_id: string;
  script_metadata: {
    title: string | null;
    author: string | null;
    page_count: number;
    word_count: number;
    extraction_method: 'pdf_text' | 'fdx_xml' | 'plain_text';
  };
  scenes: Scene[];                      // Array of identified scenes
  statistics: {
    total_scenes: number;
    unique_locations: number;
    interior_count: number;
    exterior_count: number;
    day_count: number;
    night_count: number;
    vibe_distribution: Record<VibeCategory, number>;
  };
  processing_time_ms: number;
  errors: string[];
  warnings: string[];
}

// Implementation signature (Sim Tool)
async function extract_locations_from_script(
  params: ExtractLocationsParams
): Promise<ScriptAnalysisResult>;
```

#### Sim Tool Registration

```yaml
# sim_tools/script_analyzer.yaml
tool:
  name: extract_locations_from_script
  description: |
    Analyzes a screenplay file to identify scenes and extract
    location requirements including visual vibe, physical constraints,
    and shooting context.

  parameters:
    script_file:
      type: file
      required: true
      description: PDF, TXT, or FDX screenplay file
    project_id:
      type: string
      required: true
    options:
      type: object
      properties:
        target_city:
          type: string
          default: "Los Angeles, CA"
        crew_size:
          type: integer
          default: 20

  returns:
    type: object
    schema: ScriptAnalysisResult

  implementation:
    runtime: python
    handler: tools.script_analyzer.extract_locations
    timeout: 120s
    memory: 1024MB
```

### 7.2 Google Places API

#### `find_places_google(query, location)`

```typescript
/**
 * Searches for real-world locations matching the given criteria.
 * Uses Google Maps Places API (New) for discovery.
 *
 * @param query - Search query derived from vibe and constraints
 * @param location - Geographic center for search (city or coordinates)
 * @returns Promise<PlaceSearchResult>
 *
 * @example
 * const result = await find_places_google(
 *   "industrial warehouse film location",
 *   { city: "Los Angeles, CA", radius_km: 50 }
 * );
 */

interface FindPlacesParams {
  query: string;                        // Text search query
  location: {
    city?: string;                      // e.g., "Los Angeles, CA"
    coordinates?: {
      latitude: number;
      longitude: number;
    };
    radius_km: number;                  // Search radius (default: 50)
  };
  filters?: {
    min_rating?: number;                // Minimum Google rating (1-5)
    min_reviews?: number;               // Minimum review count
    open_now?: boolean;                 // Only currently open places
    price_level_max?: number;           // 1-4 scale
    require_phone_number?: boolean;     // Only places with phone (default: true)
  };
  limit?: number;                       // Max results (default: 20, max: 60)
  scene_id?: string;                    // For result association
}

interface PlaceSearchResult {
  success: boolean;
  query_used: string;
  location_searched: {
    latitude: number;
    longitude: number;
    radius_km: number;
  };
  places: GooglePlace[];
  total_found: number;
  filtered_count: number;               // How many were filtered out
  filter_reasons: Record<string, number>; // e.g., {"no_phone": 5, "low_rating": 3}
}

interface GooglePlace {
  place_id: string;
  name: string;
  formatted_address: string;
  latitude: number;
  longitude: number;
  phone_number: string | null;          // National format
  international_phone: string | null;   // International format
  website: string | null;
  google_maps_url: string;

  // Ratings
  rating: number | null;
  user_ratings_total: number;
  price_level: number | null;

  // Hours
  opening_hours: {
    open_now: boolean;
    weekday_text: string[];
    periods: Array<{
      open: { day: number; time: string };
      close: { day: number; time: string };
    }>;
  } | null;

  // Photos (up to 5)
  photos: Array<{
    photo_reference: string;
    url: string;                        // Pre-signed URL
    width: number;
    height: number;
    attributions: string[];
  }>;

  // Additional context
  types: string[];                      // e.g., ["establishment", "warehouse"]
  business_status: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
  editorial_summary: string | null;

  // Computed
  distance_km: number;
  match_score: number;                  // 0-1 based on query relevance
}

// Implementation signature (Sim Tool)
async function find_places_google(
  params: FindPlacesParams
): Promise<PlaceSearchResult>;
```

#### Sim Tool Registration

```yaml
# sim_tools/google_places.yaml
tool:
  name: find_places_google
  description: |
    Searches Google Maps for real-world locations matching
    the given query within a specified geographic area.
    Retrieves full place details including phone numbers.

  parameters:
    query:
      type: string
      required: true
      description: Search query for places
    location:
      type: object
      required: true
      properties:
        city:
          type: string
        coordinates:
          type: object
        radius_km:
          type: number
          default: 50
    filters:
      type: object
      properties:
        min_rating:
          type: number
        require_phone_number:
          type: boolean
          default: true
    limit:
      type: integer
      default: 20
      max: 60

  returns:
    type: object
    schema: PlaceSearchResult

  implementation:
    runtime: typescript
    handler: tools.googlePlaces.findPlaces
    timeout: 30s

  rate_limits:
    requests_per_minute: 60

  secrets:
    - GOOGLE_MAPS_API_KEY
```

### 7.3 Vapi Call API

#### `trigger_vapi_call(phone_number, campaign_context)`

```typescript
/**
 * Initiates an outbound AI voice call to a venue.
 * The Vapi agent will negotiate on behalf of the production.
 *
 * @param phone_number - The venue's phone number
 * @param campaign_context - Context variables for the call
 * @returns Promise<VapiCallResult>
 *
 * @example
 * const result = await trigger_vapi_call(
 *   "+1-213-555-0147",
 *   {
 *     project_name: "Night Shift",
 *     production_company: "Meridian Pictures",
 *     filming_dates: "March 15-17, 2026",
 *     duration: "two full days",
 *     crew_size: 25
 *   }
 * );
 */

interface TriggerVapiCallParams {
  phone_number: string;                 // E.164 or national format
  candidate_id: string;                 // LocationCandidate ID for tracking
  campaign_context: {
    // Required context
    project_name: string;
    production_company: string;
    filming_dates: string;              // Human-readable date range
    duration_description: string;       // e.g., "two full days, 12 hours each"
    crew_size: number;

    // Optional context
    scene_description?: string;         // Brief scene context
    equipment_description?: string;     // What we'll bring
    specific_requirements?: string[];   // Must-haves for this location
    budget_hint?: string;               // e.g., "around $2,000-3,000 per day"
  };
  options?: {
    max_duration_minutes?: number;      // Call timeout (default: 10)
    retry_on_voicemail?: boolean;       // Auto-retry if voicemail (default: true)
    retry_delay_minutes?: number;       // Delay before retry (default: 60)
    max_retries?: number;               // Max retry attempts (default: 2)
    preferred_call_times?: string[];    // e.g., ["10:00-12:00", "14:00-16:00"]
  };
}

interface VapiCallResult {
  success: boolean;
  call_id: string;                      // Vapi call ID
  status: 'queued' | 'initiated' | 'failed';
  estimated_start_time: Date;
  callback_url: string;                 // Where results will POST
  error?: string;
}

// Implementation signature (Sim Tool)
async function trigger_vapi_call(
  params: TriggerVapiCallParams
): Promise<VapiCallResult>;
```

#### Sim Tool Registration

```yaml
# sim_tools/vapi_caller.yaml
tool:
  name: trigger_vapi_call
  description: |
    Initiates an AI-powered outbound phone call to a venue
    to inquire about filming availability and negotiate terms.
    Results are delivered asynchronously via webhook.

  parameters:
    phone_number:
      type: string
      required: true
      description: Venue phone number
      pattern: "^\\+?[1-9]\\d{1,14}$"
    candidate_id:
      type: string
      required: true
      description: LocationCandidate ID for tracking
    campaign_context:
      type: object
      required: true
      properties:
        project_name:
          type: string
          required: true
        production_company:
          type: string
          required: true
        filming_dates:
          type: string
          required: true
        duration_description:
          type: string
          required: true
        crew_size:
          type: integer
          required: true
    options:
      type: object
      properties:
        max_duration_minutes:
          type: integer
          default: 10
        retry_on_voicemail:
          type: boolean
          default: true

  returns:
    type: object
    schema: VapiCallResult

  implementation:
    runtime: typescript
    handler: tools.vapiCaller.triggerCall
    timeout: 15s
    async: true
    webhook_event: "vapi.call.completed"

  rate_limits:
    concurrent_calls: 5
    calls_per_hour: 50

  secrets:
    - VAPI_API_KEY
    - VAPI_PHONE_NUMBER_ID
```

### 7.4 Additional API Endpoints

#### REST API Routes

```typescript
// /api/projects
POST   /api/projects                    // Create new project
GET    /api/projects                    // List user's projects
GET    /api/projects/:id                // Get project details
PATCH  /api/projects/:id                // Update project
DELETE /api/projects/:id                // Delete project

// /api/scripts
POST   /api/scripts/upload              // Upload script file
POST   /api/scripts/analyze             // Trigger analysis (Sim workflow)
GET    /api/scripts/:projectId/status   // Get analysis status

// /api/scenes
GET    /api/scenes/:projectId           // List scenes for project
PATCH  /api/scenes/:id                  // Update scene (constraints, priority)

// /api/locations
GET    /api/locations/:sceneId          // List candidates for scene
POST   /api/locations/search            // Trigger Google search (Sim tool)
PATCH  /api/locations/:id               // Update candidate status
POST   /api/locations/:id/approve       // Approve and book
POST   /api/locations/:id/reject        // Reject candidate

// /api/calls
GET    /api/calls/:candidateId          // Get call details
POST   /api/calls/trigger               // Trigger Vapi call
GET    /api/calls/:id/recording         // Get recording URL (signed)
GET    /api/calls/:id/transcript        // Get call transcript

// /api/bookings
GET    /api/bookings/:projectId         // List bookings for project
GET    /api/bookings/:id                // Get booking details
PATCH  /api/bookings/:id                // Update booking status
POST   /api/bookings/:id/resend-email   // Resend confirmation email

// /api/webhooks
POST   /api/webhooks/vapi               // Vapi callback endpoint
POST   /api/webhooks/sendgrid           // Email event tracking
```

---

## 8. Edge Cases & Error Handling

### 8.1 Google Maps: No Phone Number Found

**Scenario:** A location is discovered that matches the vibe/constraints but has no phone number in Google Places.

#### Detection
```typescript
if (!place.phone_number && !place.international_phone) {
  candidate.vapi_call_status = 'no_phone_number';
  candidate.status = 'human_review';
}
```

#### Handling Strategy

| Priority | Action | Implementation |
|----------|--------|----------------|
| 1 | **Flag for Manual Research** | Mark candidate with `status: 'human_review'` and `vapi_call_status: 'no_phone_number'` |
| 2 | **Website Scraping (Optional)** | If `website_url` exists, attempt to extract phone from website via Firecrawl/Playwright |
| 3 | **Display in UI** | Show in dashboard with "Manual Call Required" badge and website link |
| 4 | **User Action** | User can manually enter phone number or mark as "Not Viable" |

#### UI Representation
```
┌──────────────────┐
│ [Photo]          │
│                  │
│ Cool Warehouse   │
├──────────────────┤
│ ⚠️ No Phone Found │
│                  │
│ Website: [Link]  │
├──────────────────┤
│ [Add Phone #]    │
│ [Mark Not Viable]│
│ [Open Maps]      │
└──────────────────┘
```

#### Database Update
```sql
UPDATE location_candidates
SET
  vapi_call_status = 'no_phone_number',
  status = 'human_review',
  red_flags = array_append(red_flags, 'Phone number not available in listing')
WHERE id = $1;
```

### 8.2 Vapi: Voicemail Reached

**Scenario:** Vapi call connects but reaches voicemail instead of a live person.

#### Detection
Vapi webhook returns:
```json
{
  "message": {
    "type": "end-of-call-report",
    "call": {
      "status": "ended",
      "endedReason": "voicemail"
    }
  }
}
```

#### Handling Strategy

```typescript
async function handleVoicemailCase(
  candidateId: string,
  callResult: VapiCallResult
): Promise<void> {

  const candidate = await db.locationCandidate.findUnique({
    where: { id: candidateId }
  });

  const currentRetries = candidate.call_retry_count || 0;
  const maxRetries = 2;

  if (currentRetries < maxRetries) {
    // Schedule retry with exponential backoff
    const delayMinutes = Math.pow(2, currentRetries) * 30; // 30min, 60min

    await db.locationCandidate.update({
      where: { id: candidateId },
      data: {
        vapi_call_status: 'voicemail',
        call_retry_count: currentRetries + 1,
        next_call_attempt_at: new Date(Date.now() + delayMinutes * 60000),
        call_notes: `Voicemail reached on attempt ${currentRetries + 1}. Retry scheduled.`
      }
    });

    // Queue retry job
    await queue.add('retry_vapi_call', {
      candidateId,
      delayMs: delayMinutes * 60000
    });

  } else {
    // Max retries exhausted - flag for human intervention
    await db.locationCandidate.update({
      where: { id: candidateId },
      data: {
        vapi_call_status: 'voicemail',
        status: 'human_review',
        red_flags: [...candidate.red_flags, 'Unable to reach after 3 attempts'],
        call_notes: `Voicemail reached ${maxRetries + 1} times. Manual follow-up required.`
      }
    });
  }
}
```

#### Vapi Voicemail Handling Option
Configure Vapi to leave a voicemail:

```json
{
  "voicemailDetection": {
    "enabled": true,
    "provider": "twilio"
  },
  "voicemailMessage": "Hello, this is a message from {{production_company}} regarding a potential filming opportunity. We're interested in your venue for an upcoming production. Please call us back at {{callback_number}} at your earliest convenience. Thank you!"
}
```

#### UI Representation
```
┌──────────────────┐
│ [Photo]          │
│ Cool Warehouse   │
├──────────────────┤
│ 📞 Voicemail     │
│ Attempts: 2/3    │
│ Next try: 2:30pm │
├──────────────────┤
│ [Call Now]       │
│ [Skip Retries]   │
└──────────────────┘
```

### 8.3 Ambiguous Script Location

**Scenario:** The script contains a location description that is too vague or abstract to map to real-world places.

#### Examples of Ambiguous Locations
- `INT. A DARK PLACE - NIGHT`
- `EXT. SOMEWHERE BEAUTIFUL - DAY`
- `INT. VILLAIN'S LAIR - NIGHT`
- `EXT. THE EDGE OF THE WORLD - DAWN`

#### Detection Logic
```typescript
function assessLocationAmbiguity(sceneHeader: string, context: string): AmbiguityAssessment {
  const ambiguityIndicators = [
    'somewhere',
    'a place',
    'unknown',
    'mysterious',
    'abstract',
    'dream',
    'fantasy',
    'void'
  ];

  const concreteIndicators = [
    'house', 'apartment', 'office', 'restaurant', 'bar', 'warehouse',
    'street', 'park', 'beach', 'hospital', 'school', 'store', 'hotel',
    'church', 'factory', 'airport', 'station', 'parking', 'roof'
  ];

  const headerLower = sceneHeader.toLowerCase();
  const isAmbiguous = ambiguityIndicators.some(i => headerLower.includes(i));
  const hasConcrete = concreteIndicators.some(i => headerLower.includes(i));

  return {
    is_ambiguous: isAmbiguous && !hasConcrete,
    confidence: calculateConfidence(sceneHeader, context),
    suggested_interpretations: isAmbiguous ?
      generateInterpretations(sceneHeader, context) : []
  };
}
```

#### Handling Strategy

```typescript
interface AmbiguousLocationHandling {
  action: 'require_clarification' | 'suggest_interpretations' | 'skip_auto_search';
}

async function handleAmbiguousLocation(
  scene: Scene,
  assessment: AmbiguityAssessment
): Promise<void> {

  if (assessment.is_ambiguous) {
    // Generate LLM-based interpretations
    const interpretations = await generateLocationInterpretations(
      scene.scene_header,
      scene.script_excerpt
    );

    // Update scene with clarification request
    await db.scene.update({
      where: { id: scene.id },
      data: {
        status: 'needs_clarification',
        ambiguity_flag: true,
        suggested_interpretations: interpretations,
        clarification_prompt: buildClarificationPrompt(scene, interpretations)
      }
    });

    // Notify user in UI
    await notifyUser(scene.project_id, {
      type: 'clarification_needed',
      scene_id: scene.id,
      message: `"${scene.scene_header}" needs clarification`,
      options: interpretations
    });
  }
}
```

#### LLM Interpretation Generation
```typescript
async function generateLocationInterpretations(
  header: string,
  context: string
): Promise<Interpretation[]> {

  const prompt = `
    A screenplay contains this scene: "${header}"

    Context from script: "${context}"

    This location description is ambiguous. Suggest 3-5 concrete,
    real-world location types that could work for this scene.

    For each suggestion, provide:
    1. A specific location type (e.g., "abandoned warehouse")
    2. Why it fits the scene's mood
    3. A Google Places search query to find such locations

    Respond in JSON format.
  `;

  const response = await llm.generate(prompt);
  return JSON.parse(response);
}
```

#### UI Flow
```
┌─────────────────────────────────────────────────────────────────────┐
│  ⚠️ Clarification Needed                                           │
│                                                                     │
│  Scene: "INT. VILLAIN'S LAIR - NIGHT"                              │
│                                                                     │
│  This location is abstract. Please choose an interpretation:       │
│                                                                     │
│  ○ Underground bunker / basement                                   │
│    "Fits the secretive, hidden nature of a villain's hideout"      │
│                                                                     │
│  ○ Industrial warehouse with dark lighting                         │
│    "Large space for dramatic confrontations"                       │
│                                                                     │
│  ○ Abandoned subway station / tunnel                               │
│    "Urban gritty aesthetic, isolated feeling"                      │
│                                                                     │
│  ○ Custom interpretation: [_______________]                        │
│                                                                     │
│  [Skip This Location]                          [Confirm Selection] │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.4 Additional Edge Cases

#### 8.4.1 Call Connected but No Useful Information

**Scenario:** Vapi call connects, conversation happens, but extracted data is incomplete.

```typescript
function assessCallQuality(extractedData: ExtractedCallData): CallQualityScore {
  const requiredFields = ['venue_available', 'price_quoted', 'decision_maker_name'];
  const completedFields = requiredFields.filter(f => extractedData[f] != null);

  return {
    score: completedFields.length / requiredFields.length,
    missing: requiredFields.filter(f => extractedData[f] == null),
    recommendation: completedFields.length < 2 ? 'manual_followup' : 'proceed'
  };
}
```

**Handling:**
- If score < 0.5: Flag for manual follow-up call
- If score >= 0.5 but < 1: Proceed but highlight missing data in UI
- If score = 1: Full success

#### 8.4.2 Venue Declines Filming

**Scenario:** Venue explicitly states they don't allow filming.

```typescript
// Vapi extraction includes:
{
  "venue_available": false,
  "red_flags": ["Does not allow filming", "No media productions permitted"]
}

// Handling
if (!extractedData.venue_available &&
    extractedData.red_flags?.some(f => f.includes('not allow') || f.includes('no filming'))) {
  await db.locationCandidate.update({
    where: { id: candidateId },
    data: {
      status: 'rejected',
      rejection_reason: 'Venue does not permit filming',
      auto_rejected: true
    }
  });
}
```

#### 8.4.3 Rate Limiting / API Failures

**Scenario:** Google Maps or Vapi API returns rate limit or server errors.

```typescript
// Exponential backoff with jitter
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;

      if (isRateLimitError(error)) {
        const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 30000);
        await sleep(delay);
      } else if (isServerError(error)) {
        await sleep(1000 * (attempt + 1));
      } else {
        throw error; // Don't retry client errors
      }
    }
  }
}
```

#### 8.4.4 Script Too Short or Invalid

**Scenario:** Uploaded file is not a valid screenplay or contains minimal content.

```typescript
function validateScript(extractedText: string): ValidationResult {
  const issues: string[] = [];

  // Check length
  if (extractedText.length < 1000) {
    issues.push('Script appears too short (less than ~1 page)');
  }

  // Check for scene headers
  const sceneHeaderPattern = /^(INT\.|EXT\.|INT\/EXT\.)/gm;
  const sceneMatches = extractedText.match(sceneHeaderPattern);

  if (!sceneMatches || sceneMatches.length < 2) {
    issues.push('Could not identify standard screenplay scene headers');
  }

  // Check for character names (ALL CAPS lines)
  const characterPattern = /^[A-Z][A-Z\s]+$/gm;
  const characterMatches = extractedText.match(characterPattern);

  if (!characterMatches || characterMatches.length < 5) {
    issues.push('Document may not be in standard screenplay format');
  }

  return {
    is_valid: issues.length === 0,
    issues,
    confidence: issues.length === 0 ? 1.0 : Math.max(0, 1 - (issues.length * 0.3))
  };
}
```

### 8.5 Error Response Standards

All API errors follow a consistent structure:

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;           // Machine-readable error code
    message: string;        // Human-readable message
    details?: any;          // Additional context
    retryable: boolean;     // Whether client should retry
    retry_after_ms?: number; // Suggested retry delay
  };
  request_id: string;       // For support debugging
}

// Error codes
const ERROR_CODES = {
  // Script Analysis
  SCRIPT_TOO_SHORT: 'E1001',
  SCRIPT_INVALID_FORMAT: 'E1002',
  SCRIPT_NO_SCENES_FOUND: 'E1003',

  // Google Places
  GOOGLE_RATE_LIMIT: 'E2001',
  GOOGLE_NO_RESULTS: 'E2002',
  GOOGLE_INVALID_LOCATION: 'E2003',

  // Vapi
  VAPI_INVALID_PHONE: 'E3001',
  VAPI_CALL_FAILED: 'E3002',
  VAPI_QUOTA_EXCEEDED: 'E3003',

  // General
  UNAUTHORIZED: 'E4001',
  VALIDATION_ERROR: 'E4002',
  INTERNAL_ERROR: 'E5000'
};
```

---

## 9. Tech Stack Recommendations

### 9.1 Core Stack Overview (MVP)

| Layer | Technology | Justification |
|-------|------------|---------------|
| **Orchestration** | **Sim.ai** | Purpose-built for agentic workflows with native tool calling, state management, and human-in-the-loop checkpoints |
| **Voice AI** | **Vapi.ai** | Leading voice AI platform with built-in call recording, transcription, and structured data extraction |
| **Location Discovery** | **Google Maps Places API (New)** | Most comprehensive business data; phone numbers critical for outreach |
| **Frontend** | **Next.js 14+ (App Router)** | React Server Components for performance; API routes for backend |
| **Backend (All-in-One)** | **Supabase** | PostgreSQL database, file storage, auth, and realtime subscriptions in one platform |
| **Email** | **Resend** | Simple transactional email API |

### 9.2 Detailed Technology Specifications

#### 9.2.1 Sim.ai (Orchestration Layer)

**Role:** Central workflow engine managing the entire pipeline.

**Key Features Used:**
- **Workflow Definitions:** YAML-based declarative workflows
- **Tool Registry:** Register Google Maps, Vapi, and custom tools
- **State Persistence:** Durable execution across async operations
- **Branching Logic:** Conditional flows based on API responses
- **Human Checkpoints:** Pause execution for approval
- **Parallel Execution:** Concurrent API calls where possible

**Integration Pattern:**
```typescript
// sim-client.ts
import { SimClient } from '@sim/sdk';

export const sim = new SimClient({
  apiKey: process.env.SIM_API_KEY,
  projectId: process.env.SIM_PROJECT_ID
});

// Trigger workflow from API route
export async function triggerScriptAnalysis(projectId: string, scriptUrl: string) {
  return await sim.workflows.trigger('autoscout_main', {
    inputs: { projectId, scriptUrl },
    callbackUrl: `${process.env.APP_URL}/api/webhooks/sim`
  });
}
```

#### 9.2.2 Vapi.ai (Voice AI)

**Role:** Outbound AI phone calls for venue negotiation.

**Configuration:**
```typescript
// vapi-config.ts
export const VAPI_CONFIG = {
  assistantId: process.env.VAPI_ASSISTANT_ID,
  phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,

  // Voice settings
  voice: {
    provider: '11labs',
    voiceId: 'rachel', // Professional female voice
    stability: 0.5,
    speed: 1.0
  },

  // Model settings
  model: {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7
  },

  // Call settings
  maxDurationSeconds: 600, // 10 minute max
  recordingEnabled: true,
  transcriptionProvider: 'deepgram',

  // Extraction
  analysisPlan: {
    structuredDataPlan: {
      schema: EXTRACTION_SCHEMA
    },
    summaryPlan: {
      enabled: true
    }
  }
};
```

#### 9.2.3 Google Maps Places API (New)

**Role:** Location discovery with phone number retrieval.

**API Configuration:**
```typescript
// google-places-config.ts
export const GOOGLE_PLACES_CONFIG = {
  baseUrl: 'https://places.googleapis.com/v1',

  // Field masks for different operations
  fieldMasks: {
    textSearch: [
      'places.id',
      'places.displayName',
      'places.formattedAddress',
      'places.location',
      'places.rating',
      'places.userRatingCount',
      'places.photos',
      'places.regularOpeningHours',
      'places.businessStatus'
    ].join(','),

    placeDetails: [
      'nationalPhoneNumber',
      'internationalPhoneNumber',
      'websiteUri',
      'editorialSummary',
      'priceLevel'
    ].join(',')
  },

  // Default search parameters
  defaults: {
    maxResultCount: 20,
    locationBias: {
      // Los Angeles default
      circle: {
        center: { latitude: 34.0522, longitude: -118.2437 },
        radius: 50000 // 50km
      }
    }
  }
};
```

#### 9.2.4 Frontend (Next.js 14)

**Architecture:**
```
/app
├── (auth)/
│   ├── login/
│   └── signup/
├── (dashboard)/
│   ├── layout.tsx           # Dashboard shell
│   ├── projects/
│   │   ├── page.tsx         # Project list
│   │   ├── [id]/
│   │   │   ├── page.tsx     # Project overview
│   │   │   ├── scenes/
│   │   │   ├── locations/
│   │   │   └── bookings/
│   │   └── new/
│   └── settings/
├── api/
│   ├── projects/
│   ├── scripts/
│   ├── locations/
│   ├── calls/
│   ├── bookings/
│   └── webhooks/
│       ├── vapi/
│       ├── sendgrid/
│       └── sim/
└── components/
    ├── location-card.tsx
    ├── call-player.tsx
    ├── booking-modal.tsx
    └── ...
```

**Key Dependencies:**
```json
{
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "@supabase/supabase-js": "^2.39.0",
    "@tanstack/react-query": "^5.0.0",
    "tailwindcss": "^3.4.0",
    "shadcn-ui": "latest",
    "lucide-react": "^0.300.0"
  }
}
```

#### 9.2.5 Supabase (All-in-One Backend)

**Role:** Single platform providing database, storage, auth, and realtime.

**Why Supabase for MVP:**
- **PostgreSQL Database:** Full SQL with JSONB support
- **Storage:** Built-in file storage for scripts and recordings
- **Auth:** Ready-to-use authentication
- **Realtime:** WebSocket subscriptions for live call status updates
- **Edge Functions:** Webhook handlers if needed

**Integration:**
```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Realtime subscription for call updates
supabase
  .channel('call-updates')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'location_candidates',
    filter: `project_id=eq.${projectId}`
  }, (payload) => {
    // Update UI when call status changes
  })
  .subscribe();
```

### 9.3 Infrastructure Architecture (MVP)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Vercel (Frontend + API)                     │
│                                                                     │
│   ┌─────────────────┐    ┌─────────────────┐                       │
│   │   Next.js App   │    │   API Routes    │                       │
│   │   (React SSR)   │    │  (Serverless)   │                       │
│   └─────────────────┘    └─────────────────┘                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        External Services                             │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │   Sim.ai    │  │   Vapi.ai   │  │   Google    │  │   Resend   │ │
│  │(Orchestrate)│  │ (Voice AI)  │  │ Maps API    │  │  (Email)   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Supabase (All-in-One)                           │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │  PostgreSQL │  │   Storage   │  │    Auth     │  │  Realtime  │ │
│  │  (Database) │  │   (Files)   │  │   (Users)   │  │(WebSocket) │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.4 Cost Estimation (MVP)

| Service | Tier | Estimated Monthly Cost | Notes |
|---------|------|------------------------|-------|
| Sim.ai | Starter/Pro | $50-150 | Based on workflow executions |
| Vapi.ai | Pay-as-you-go | $0.05/min | ~$50-100 for MVP testing |
| Google Maps | Pay-as-you-go | ~$50-100 | Text Search + Details calls |
| Vercel | Hobby/Pro | $0-20 | Free tier may suffice for MVP |
| Supabase | Free/Pro | $0-25 | Free tier includes 500MB DB, 1GB storage |
| Resend | Free | $0 | 3K emails/month free |
| **Total** | | **~$150-400/month** | MVP scale |

---

## 10. Success Metrics

### 10.1 Key Performance Indicators (KPIs)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Script-to-Candidates Time** | < 30 minutes | Time from upload to first location candidates |
| **Call Success Rate** | > 60% | Calls that reach a live person and extract data |
| **Vibe Match Accuracy** | > 80% | User approval rate of suggested locations |
| **Booking Conversion Rate** | > 25% | Approved candidates / total candidates shown |
| **User Satisfaction** | > 4.2/5 | Post-booking survey score |
| **Time Saved vs. Manual** | > 75% | Compared to traditional scouting |

### 10.2 Operational Metrics

- **API Latency:** P95 < 500ms for all endpoints
- **Uptime:** 99.9% availability
- **Error Rate:** < 0.1% of requests
- **Call Queue Depth:** < 50 pending calls at any time

---

## 11. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Vapi call quality issues** | Medium | High | Fallback to recorded message; manual call option |
| **Google Places rate limits** | Low | Medium | Request quota increase; implement caching |
| **Venue refuses AI calls** | Medium | Medium | Option for human-placed calls; clear disclosure |
| **Script parsing failures** | Low | Medium | Manual scene entry fallback; format guidelines |
| **Privacy complaints** | Low | High | Clear disclosure in calls; opt-out mechanism |
| **Cost overruns** | Medium | Medium | Usage alerts; budget caps; tier optimization |

---

## 12. Appendix

### 12.1 Glossary

| Term | Definition |
|------|------------|
| **Vibe** | The visual/aesthetic quality of a location (e.g., "industrial", "luxury") |
| **Candidate** | A potential real-world location matching scene requirements |
| **Grounding** | The process of mapping abstract requirements to real locations |
| **HITL** | Human-in-the-loop; requiring human approval before critical actions |

### 12.2 References

- [Sim.ai Documentation](https://docs.sim.ai)
- [Vapi.ai API Reference](https://docs.vapi.ai)
- [Google Maps Places API (New)](https://developers.google.com/maps/documentation/places/web-service)
- [Final Draft FDX Format Specification](https://www.finaldraft.com)

### 12.3 Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-24 | Product Team | Initial PRD |

---

*End of Document*
