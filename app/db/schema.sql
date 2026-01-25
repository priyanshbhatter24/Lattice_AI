-- AutoScout Database Schema
-- Run this in Supabase SQL Editor to create all tables

-- ══════════════════════════════════════════════════════════
-- PROJECTS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    company_name TEXT NOT NULL,
    script_file_url TEXT,
    target_city TEXT DEFAULT 'Los Angeles, CA',
    target_latitude DECIMAL(10, 8) DEFAULT 34.0522,
    target_longitude DECIMAL(11, 8) DEFAULT -118.2437,
    filming_start_date DATE,
    filming_end_date DATE,
    crew_size INTEGER DEFAULT 20,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'analyzing', 'scouting', 'booking', 'complete')),
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════
-- SCENES (Location Requirements from Stage 1)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS scenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scene_number TEXT NOT NULL,
    scene_header TEXT NOT NULL,
    page_numbers INTEGER[] DEFAULT '{}',
    script_excerpt TEXT,

    -- Vibe (stored as JSONB)
    vibe JSONB NOT NULL DEFAULT '{}',

    -- Constraints (stored as JSONB)
    constraints JSONB NOT NULL DEFAULT '{}',

    estimated_shoot_hours INTEGER DEFAULT 12,
    priority TEXT DEFAULT 'important' CHECK (priority IN ('critical', 'important', 'flexible')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scouting', 'candidates_found', 'booked')),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════
-- LOCATION CANDIDATES (Output from Stage 2)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS location_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Google Places Data
    google_place_id TEXT,
    venue_name TEXT NOT NULL,
    formatted_address TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    phone_number TEXT,
    website_url TEXT,
    google_rating DECIMAL(2, 1),
    google_review_count INTEGER DEFAULT 0,
    price_level INTEGER,

    -- Photos (URLs only)
    photo_urls TEXT[] DEFAULT '{}',
    photo_attributions TEXT[] DEFAULT '{}',

    -- Opening hours (JSONB)
    opening_hours JSONB,

    -- Match scores
    match_score DECIMAL(4, 3) DEFAULT 0,
    match_reasoning TEXT,
    distance_from_center_km DECIMAL(6, 2),

    -- Visual verification
    visual_vibe_score DECIMAL(4, 3),
    visual_features_detected TEXT[] DEFAULT '{}',
    visual_concerns TEXT[] DEFAULT '{}',
    visual_analysis_summary TEXT,

    -- Vapi call data (Stage 3)
    vapi_call_status TEXT DEFAULT 'not_initiated',
    vapi_call_id TEXT,
    vapi_call_initiated_at TIMESTAMPTZ,
    vapi_call_completed_at TIMESTAMPTZ,
    vapi_call_duration_seconds INTEGER,
    vapi_recording_url TEXT,
    vapi_transcript TEXT,

    -- Negotiation data (from Stage 3)
    venue_available BOOLEAN,
    availability_details TEXT,
    negotiated_price DECIMAL(10, 2),
    price_unit TEXT CHECK (price_unit IN ('hourly', 'half_day', 'full_day', 'flat_fee')),
    manager_name TEXT,
    manager_title TEXT,
    manager_email TEXT,
    manager_direct_phone TEXT,
    callback_required BOOLEAN DEFAULT FALSE,
    callback_details TEXT,
    red_flags TEXT[] DEFAULT '{}',
    call_summary TEXT,
    call_success_score DECIMAL(3, 2),

    -- Workflow status
    status TEXT DEFAULT 'discovered' CHECK (status IN (
        'discovered', 'call_pending', 'call_in_progress', 'call_completed',
        'call_failed', 'human_review', 'approved', 'rejected', 'booked'
    )),
    rejection_reason TEXT,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    booking_id UUID,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════
-- BOOKINGS (Stage 4)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_candidate_id UUID NOT NULL REFERENCES location_candidates(id),
    project_id UUID NOT NULL REFERENCES projects(id),
    scene_id UUID NOT NULL REFERENCES scenes(id),

    -- Venue info (denormalized for convenience)
    venue_name TEXT NOT NULL,
    venue_address TEXT,
    venue_phone TEXT,
    contact_name TEXT,
    contact_email TEXT,

    -- Booking terms
    confirmed_price DECIMAL(10, 2),
    price_unit TEXT,
    total_estimated_cost DECIMAL(10, 2),
    filming_dates JSONB,
    special_arrangements TEXT,

    -- Status
    status TEXT DEFAULT 'pending_confirmation' CHECK (status IN (
        'pending_confirmation', 'confirmed', 'contract_sent', 'contract_signed', 'cancelled'
    )),

    -- Email tracking
    confirmation_email_sent_at TIMESTAMPTZ,
    confirmation_email_id TEXT,
    venue_response_received_at TIMESTAMPTZ,
    venue_response TEXT,

    -- Approval
    approved_by UUID NOT NULL,
    approved_at TIMESTAMPTZ NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_scenes_project_id ON scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_candidates_scene_id ON location_candidates(scene_id);
CREATE INDEX IF NOT EXISTS idx_candidates_project_id ON location_candidates(project_id);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON location_candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_vapi_status ON location_candidates(vapi_call_status);
CREATE INDEX IF NOT EXISTS idx_bookings_project_id ON bookings(project_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

-- ══════════════════════════════════════════════════════════
-- UPDATED_AT TRIGGER
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER scenes_updated_at
    BEFORE UPDATE ON scenes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER location_candidates_updated_at
    BEFORE UPDATE ON location_candidates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════
-- ENABLE REALTIME (for Stage 3 call status updates)
-- ══════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE location_candidates;
