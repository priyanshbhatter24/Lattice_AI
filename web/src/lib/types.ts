/**
 * TypeScript types for the Scout frontend.
 * These types match the backend API response formats.
 */

// Vibe/aesthetic classification
export interface Vibe {
  primary: string;
  secondary?: string | null;
  descriptors: string[];
  confidence: number;
}

// Physical constraints for filming
export interface Constraints {
  interior_exterior: "interior" | "exterior" | "both";
  time_of_day: "day" | "night" | "both";
  special_requirements: string[];
}

// Complete location requirement from script analysis
export interface LocationRequirement {
  // Note: backend sends "id" but frontend uses it as scene_id for keys
  id: string;
  scene_id: string;
  project_id: string;
  scene_number: string;
  scene_header: string;
  page_numbers: number[];
  script_context: string;
  vibe: Vibe;
  constraints: Constraints;
  estimated_shoot_duration_hours: number;
  priority: "critical" | "important" | "flexible";
  target_city: string;
  search_radius_km: number;
  max_results: number;
  location_description: string;
  scouting_notes: string;
}

// Progress update during analysis
export interface AnalysisProgress {
  processed: number;
  total: number;
  percent: number;
}

// SSE event types from /api/scripts/analyze
export type SSEEventType = "status" | "location" | "progress" | "complete" | "error" | "phase";

export interface StatusEventData {
  message: string;
  pages?: number;
  total?: number;
}

export interface PhaseEventData {
  phase: string;
}

export interface LocationEventData extends LocationRequirement {}

export interface ProgressEventData {
  processed: number;
  total: number;
  percent: number;
}

export interface CompleteEventData {
  success: boolean;
  total_locations: number;
  processing_time_seconds: number;
  message?: string;
}

export interface ErrorEventData {
  error: string;
}

export type SSEEvent =
  | { type: "status"; data: StatusEventData }
  | { type: "location"; data: LocationEventData }
  | { type: "progress"; data: ProgressEventData }
  | { type: "complete"; data: CompleteEventData }
  | { type: "error"; data: ErrorEventData }
  | { type: "phase"; data: PhaseEventData };

// Available script for selection
export interface AvailableScript {
  filename: string;
  path: string;
  size: number;
}

// ══════════════════════════════════════════════════════════
// Stage 3: Vapi Calling Types
// ══════════════════════════════════════════════════════════

// Vapi Call Status
export type VapiCallStatus =
  | "not_initiated"
  | "queued"
  | "ringing"
  | "in_progress"
  | "completed"
  | "voicemail"
  | "no_answer"
  | "busy"
  | "failed"
  | "no_phone_number";

// Location Candidate Workflow Status
export type CandidateStatus =
  | "discovered"
  | "call_pending"
  | "call_in_progress"
  | "call_completed"
  | "call_failed"
  | "human_review"
  | "approved"
  | "rejected"
  | "booked";

// Pricing unit types
export type PriceUnit = "hourly" | "half_day" | "full_day" | "flat_fee";

// How to make a reservation
export type ReservationMethod = "email" | "call" | "website";

// Project for organizing film shoots
export interface Project {
  id: string;
  name: string;
  company_name: string;
  target_city: string;
  crew_size: number;
  filming_start_date?: string;
  filming_end_date?: string;
  script_path?: string;
  status: "draft" | "active" | "completed";
  created_at: string;
  updated_at: string;
}

export interface CreateProjectRequest {
  name: string;
  company_name: string;
  target_city?: string;
  crew_size?: number;
  filming_start_date?: string;
  filming_end_date?: string;
  script_path?: string;
}

// Availability slot extracted from Vapi call
export interface AvailabilitySlot {
  date: string; // YYYY-MM-DD
  day_name: string; // Monday, Tuesday, etc.
  start_time: string; // HH:MM
  end_time: string; // HH:MM
}

// Opening hours from Google Places
export interface OpeningHours {
  weekday_text: string[];
  periods: Array<{
    day: number;
    open_time: string;
    close_time: string;
  }>;
}

// Location Candidate - venues found for filming
export interface LocationCandidate {
  id: string;
  scene_id: string;
  project_id: string;

  // Google Places Data
  google_place_id?: string;
  venue_name: string;
  formatted_address: string;
  latitude: number;
  longitude: number;
  phone_number?: string;
  website_url?: string;
  google_rating?: number;
  google_review_count: number;
  price_level?: number;
  photo_urls: string[];
  photo_attributions: string[];
  opening_hours?: OpeningHours;

  // Match scoring
  match_score: number;
  match_reasoning: string;
  distance_from_center_km: number;

  // Visual analysis
  visual_vibe_score?: number;
  visual_features_detected: string[];
  visual_concerns: string[];
  visual_analysis_summary?: string;

  // Vapi Call Data
  vapi_call_status: VapiCallStatus;
  vapi_call_id?: string;
  vapi_call_initiated_at?: string;
  vapi_call_completed_at?: string;
  vapi_call_duration_seconds?: number;
  vapi_recording_url?: string;
  vapi_transcript?: string;

  // Negotiation Data (from call)
  venue_available?: boolean;
  availability_details?: string;
  availability_slots?: AvailabilitySlot[];
  negotiated_price?: number;
  price_unit?: PriceUnit;
  manager_name?: string;
  manager_title?: string;
  manager_email?: string;
  manager_direct_phone?: string;
  reservation_method?: ReservationMethod;
  reservation_details?: string;
  callback_required: boolean;
  callback_details?: string;
  red_flags: string[];
  call_summary?: string;
  call_success_score?: number;

  // Workflow Status
  status: CandidateStatus;
  rejection_reason?: string;
  approved_by?: string;
  approved_at?: string;
  booking_id?: string;

  // Metadata
  created_at: string;
  updated_at: string;
}

export interface CreateLocationRequest {
  venue_name: string;
  phone_number: string;
  formatted_address: string;
  project_id: string;
  scene_id: string;
  google_place_id?: string;
  latitude?: number;
  longitude?: number;
  website_url?: string;
  match_score?: number;
}

// Call API Types
export interface TriggerCallRequest {
  candidate_id: string;
}

export interface CallResponse {
  success: boolean;
  candidate_id: string;
  vapi_call_id?: string;
  error?: string;
}

export interface TriggerBatchRequest {
  candidate_ids: string[];
  max_concurrent?: number;
}

export interface BatchResponse {
  success: boolean;
  batch_id: string;
  total_calls: number;
}

export interface CallStatusResponse {
  id: string;
  status: string;
  duration?: number;
  recording_url?: string;
  transcript?: string;
  analysis?: {
    structured_data?: Record<string, unknown>;
    summary?: string;
    success_evaluation?: number;
  };
}

// Scene for a project
export interface Scene {
  id: string;
  project_id: string;
  scene_number: string;
  scene_header: string;
  page_numbers: number[];
  script_excerpt: string;
  vibe: Vibe;
  constraints: Constraints;
  estimated_shoot_hours: number;
  priority: "critical" | "important" | "flexible";
  status: "pending" | "candidates_found" | "call_in_progress" | "completed";
  created_at: string;
  updated_at: string;
}

// Realtime subscription payload
export interface RealtimePayload<T = LocationCandidate> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: T;
  old: T | null;
}

// ══════════════════════════════════════════════════════════
// Stage 2: Grounding Types
// ══════════════════════════════════════════════════════════

// Scene with grounding status
export interface GroundableScene {
  id: string;
  project_id: string;
  scene_number: string;
  scene_header: string;
  page_numbers: number[];
  script_excerpt: string;
  vibe: Vibe;
  constraints: Constraints;
  estimated_shoot_hours: number;
  priority: "critical" | "important" | "flexible";
  status: "pending" | "candidates_found" | "call_in_progress" | "completed";
  candidate_count: number;
  has_candidates: boolean;
  created_at: string;
  updated_at: string;
}

// Grounding SSE event types
export type GroundingSSEEventType =
  | "status"
  | "scene_start"
  | "candidate"
  | "scene_complete"
  | "progress"
  | "complete"
  | "error";

export interface GroundingStatusEvent {
  message: string;
}

export interface GroundingSceneStartEvent {
  scene_id: string;
  scene_header: string;
  index: number;
  total: number;
}

export interface GroundingCandidateEvent {
  scene_id: string;
  candidate: LocationCandidate;
}

export interface GroundingSceneCompleteEvent {
  scene_id: string;
  scene_header: string;
  candidates_found: number;
  query_used: string;
  processing_time: number;
  errors: string[];
  warnings: string[];
}

export interface GroundingProgressEvent {
  processed: number;
  total: number;
  percent: number;
}

export interface GroundingCompleteEvent {
  success: boolean;
  total_scenes: number;
  total_candidates: number;
  message: string;
}

export interface GroundingErrorEvent {
  scene_id?: string;
  error: string;
}

export type GroundingSSEEvent =
  | { type: "status"; data: GroundingStatusEvent }
  | { type: "scene_start"; data: GroundingSceneStartEvent }
  | { type: "candidate"; data: GroundingCandidateEvent }
  | { type: "scene_complete"; data: GroundingSceneCompleteEvent }
  | { type: "progress"; data: GroundingProgressEvent }
  | { type: "complete"; data: GroundingCompleteEvent }
  | { type: "error"; data: GroundingErrorEvent };
