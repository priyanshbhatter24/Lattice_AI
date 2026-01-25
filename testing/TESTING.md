# Stage 2: Grounding & Discovery - Testing Guide

This document describes how to test the Stage 2 Grounding module independently.

## Overview

Stage 2 takes location requirements from Stage 1 (Script Analysis) and finds real-world locations using Google GenAI with Google Maps grounding.

## Prerequisites

### 1. Google Cloud Setup

You need a Google Cloud project with the following enabled:
- Vertex AI API
- Google Maps Places API (for grounding)

### 2. Authentication

Set up authentication using one of these methods:

**Option A: Service Account (Recommended for production)**
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

**Option B: User Credentials (For development)**
```bash
gcloud auth application-default login
```

### 3. Environment Variables

```bash
export GOOGLE_CLOUD_PROJECT=your-project-id
export GOOGLE_CLOUD_LOCATION=global
export GOOGLE_GENAI_USE_VERTEXAI=True
```

### 4. Install Dependencies

```bash
pip install -e ".[dev]"
```

## Assumed Inputs from Stage 1

The test suite uses sample `LocationRequirement` objects that simulate output from Stage 1 (Script Analysis). These are defined in `testing/sample_inputs.py`.

### Sample Scenes

| Scene | Header | Vibe | Priority |
|-------|--------|------|----------|
| SC_012 | INT. ABANDONED WAREHOUSE - NIGHT | industrial | critical |
| SC_007 | INT. UPSCALE RESTAURANT - EVENING | luxury | important |
| SC_003 | EXT. SUBURBAN HOUSE - DAY | suburban | important |
| SC_019 | INT. RETRO DINER - MORNING | retro-vintage | flexible |
| SC_028 | INT. HOSPITAL CORRIDOR - NIGHT | institutional | important |

### LocationRequirement Schema

Each requirement includes:

```python
LocationRequirement(
    id: str                    # UUID
    project_id: str            # e.g., "proj_nightshift_001"
    scene_number: str          # e.g., "SC_012"
    scene_header: str          # e.g., "INT. WAREHOUSE - NIGHT"
    page_numbers: list[int]    # [23, 24, 25]
    script_excerpt: str        # Relevant script text

    vibe: Vibe(
        primary: VibeCategory      # e.g., "industrial"
        secondary: VibeCategory    # e.g., "urban-gritty"
        descriptors: list[str]     # ["abandoned", "brick walls"]
        confidence: float          # 0.0 - 1.0
    )

    constraints: Constraints(
        interior_exterior: str     # "interior" | "exterior" | "both"
        time_of_day: str           # "day" | "night" | "both"
        min_ceiling_height_ft: float
        min_floor_space_sqft: float
        parking_spaces_needed: int
        power_requirements: str
        acoustic_needs: str
        special_requirements: list[str]
    )

    estimated_shoot_hours: int
    priority: str              # "critical" | "important" | "flexible"
    target_city: str           # "Los Angeles, CA"
    max_results: int           # 10
)
```

## Running Tests

### List Available Scenes

```bash
python -m testing.test_grounding --list
```

### Test Single Scene (Default)

Tests the first sample scene (SC_012 - Abandoned Warehouse):

```bash
python -m testing.test_grounding
```

### Test All Scenes

```bash
python -m testing.test_grounding --all
```

### Test Specific Scene

```bash
python -m testing.test_grounding --scene SC_007
python -m testing.test_grounding --scene SC_019
```

## Expected Output

### LocationCandidate Schema

Each found location returns:

```python
LocationCandidate(
    id: str
    scene_id: str              # Links back to requirement
    project_id: str

    # Google Places Data
    google_place_id: str
    venue_name: str            # "Arts District Warehouse"
    formatted_address: str     # "1234 Industrial Blvd, LA, CA 90021"
    latitude: float
    longitude: float
    phone_number: str | None   # Critical for Stage 3
    website_url: str | None
    google_rating: float | None
    google_review_count: int
    photo_urls: list[str]

    # Match Data
    match_score: float         # 0.0 - 1.0
    match_reasoning: str       # Why this location matches

    # Status (initialized for Stage 3)
    vapi_call_status: str      # "not_initiated" or "no_phone_number"
    status: str                # "discovered" or "human_review"
    red_flags: list[str]       # Potential concerns
)
```

### Sample Console Output

```
============================================================
STAGE 2 GROUNDING TEST - Single Scene
============================================================

Testing scene: INT. ABANDONED WAREHOUSE - NIGHT
Vibe: industrial
Descriptors: abandoned, brick walls, high ceilings, concrete floors

------------------------------------------------------------
Scene: abc123-uuid
Query: warehouse abandoned brick walls high ceilings venue for filming in Los Angeles, CA
Found: 5 candidates
Time: 3.45s

  CANDIDATES:

  [1] Arts District Warehouse
      Address: 1234 Industrial Blvd, Los Angeles, CA 90021
      Phone: +1-213-555-0147 [YES]
      Website: https://artsdistrictwarehouse.com
      Rating: 4.5 (127 reviews)
      Match Score: 0.85
      Status: discovered
      Why: Industrial warehouse with 25ft ceilings, exposed brick walls...
      Concerns: Limited street parking

  [2] Vernon Industrial Space
      Address: 5678 Factory Ave, Vernon, CA 90058
      Phone: N/A [NO (needs manual research)]
      Rating: 4.2 (45 reviews)
      Match Score: 0.60
      Status: human_review
      ...
```

## Output Files

Test results are saved to `testing/output/` as JSON files:

```
testing/output/
├── grounding_SC_012_20240124_143022.json
├── grounding_SC_007_20240124_143045.json
└── ...
```

Each file contains the full `GroundingResult` with all candidates.

## Edge Cases Tested

### 1. No Phone Number
When Google Maps grounding returns a location without a phone number:
- `vapi_call_status` = `"no_phone_number"`
- `status` = `"human_review"`
- Added to `red_flags`: "Phone number not available in listing"

### 2. Ambiguous Location
When the vibe/constraints are too vague:
- Agent uses broader search terms
- May return fewer results
- Warning added to `GroundingResult.warnings`

### 3. No Results Found
When no matching locations are found:
- `candidates` = empty list
- Error message in `GroundingResult.errors`

## Troubleshooting

### "Missing environment variables" error

```bash
# Check if variables are set
echo $GOOGLE_CLOUD_PROJECT
echo $GOOGLE_CLOUD_LOCATION

# Set them
export GOOGLE_CLOUD_PROJECT=your-project-id
export GOOGLE_CLOUD_LOCATION=global
export GOOGLE_GENAI_USE_VERTEXAI=True
```

### "Permission denied" errors

Make sure your Google Cloud project has:
1. Vertex AI API enabled
2. Proper IAM permissions for your user/service account

```bash
# Enable APIs
gcloud services enable aiplatform.googleapis.com
gcloud services enable places.googleapis.com

# Check permissions
gcloud projects get-iam-policy $GOOGLE_CLOUD_PROJECT
```

### Rate limiting

Google Maps grounding has a limit of ~5,000 queries/day. If you hit limits:
- Wait and retry later
- Use a different project
- Request quota increase

## Integration with Stage 1

In production, Stage 1 outputs `LocationRequirement` objects which are passed directly to Stage 2:

```python
from app.grounding import GroundingAgent, LocationRequirement

# Stage 1 output (from script analysis)
requirements: list[LocationRequirement] = stage1_analyze_script(script_file)

# Stage 2: Find real locations
agent = GroundingAgent()
results = await agent.find_locations_for_scenes(requirements)

# Pass candidates to Stage 3 (Vapi calls)
for result in results:
    for candidate in result.candidates:
        if candidate.phone_number:
            await stage3_trigger_vapi_call(candidate)
```

## Next Steps

After Stage 2 completes:
1. Candidates with phone numbers proceed to Stage 3 (Vapi calls)
2. Candidates without phone numbers are flagged for manual research
3. All candidates are stored in Supabase for dashboard display
