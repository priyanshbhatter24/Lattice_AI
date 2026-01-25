/**
 * TypeScript types for the Location Scout frontend.
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
export type SSEEventType = "status" | "location" | "progress" | "complete" | "error";

export interface StatusEventData {
  message: string;
  pages?: number;
  total?: number;
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
  | { type: "error"; data: ErrorEventData };

// Available script for selection
export interface AvailableScript {
  filename: string;
  path: string;
  size: number;
}
