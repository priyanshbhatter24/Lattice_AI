/**
 * API client for the Location Scout backend.
 * Handles script upload, analysis with SSE streaming, and script listing.
 */

import type {
  SSEEvent,
  AvailableScript,
  LocationRequirement,
  Project,
  CreateProjectRequest,
  LocationCandidate,
  CreateLocationRequest,
  CallResponse,
  BatchResponse,
  CallStatusResponse,
  Scene,
  GroundableScene,
  GroundingSSEEvent,
} from "./types";

// Backend API base URL - adjust for production
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Upload a screenplay PDF file.
 * @returns Object with the file path for analysis
 */
export async function uploadScript(file: File): Promise<{ path: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/api/scripts/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(error.detail || "Failed to upload script");
  }

  const data = await response.json();
  return { path: data.path };
}

/**
 * Analyze a script with SSE streaming.
 * @param filePath - Path to the PDF file (from uploadScript)
 * @param onEvent - Callback for each SSE event
 * @param onError - Callback for errors
 * @param onComplete - Callback when stream closes
 * @returns Cleanup function to abort the request
 */
export function analyzeScriptWithCallback(
  filePath: string,
  onEvent: (event: SSEEvent) => void,
  onError: (error: Error) => void,
  onComplete: () => void
): () => void {
  const abortController = new AbortController();

  const url = new URL(`${API_BASE}/api/scripts/analyze`);
  url.searchParams.set("file_path", filePath);

  console.log("[SSE] Connecting to:", url.toString());

  // Start SSE connection
  fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
    signal: abortController.signal,
  })
    .then(async (response) => {
      console.log("[SSE] Response status:", response.status);
      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log("[SSE] Stream complete");
          onComplete();
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete SSE messages (split by double newline)
        const messages = buffer.split(/\r?\n\r?\n/);
        buffer = messages.pop() || ""; // Keep incomplete message in buffer

        for (const message of messages) {
          if (!message.trim()) continue;

          const lines = message.split(/\r?\n/);
          let eventType = "";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              eventData = line.slice(5).trim();
            }
          }

          if (eventType && eventData) {
            console.log("[SSE] Event:", eventType);
            try {
              const parsedData = JSON.parse(eventData);

              // Transform backend data to match frontend expectations
              if (eventType === "location") {
                // Map backend field names to frontend expectations
                const location = parsedData as Record<string, unknown>;
                const transformed: LocationRequirement = {
                  id: location.id as string,
                  scene_id: location.id as string,
                  project_id: (location.project_id as string) || "",
                  scene_number: (location.scene_number as string) || "",
                  scene_header: (location.scene_header as string) || "",
                  page_numbers: (location.page_numbers as number[]) || [],
                  script_context: (location.script_excerpt as string) || "",
                  vibe: location.vibe as LocationRequirement["vibe"],
                  constraints: location.constraints as LocationRequirement["constraints"],
                  estimated_shoot_duration_hours: (location.estimated_shoot_hours as number) || 8,
                  priority: (location.priority as LocationRequirement["priority"]) || "important",
                  target_city: (location.target_city as string) || "Los Angeles, CA",
                  search_radius_km: (location.search_radius_km as number) || 50,
                  max_results: (location.max_results as number) || 10,
                  location_description: (location.location_description as string) || "",
                  scouting_notes: (location.scouting_notes as string) || "",
                };
                onEvent({ type: "location", data: transformed });
              } else {
                onEvent({ type: eventType as SSEEvent["type"], data: parsedData });
              }
            } catch (e) {
              console.error("[SSE] Parse error:", eventData, e);
            }
          }
        }
      }
    })
    .catch((error) => {
      if (error.name === "AbortError") {
        console.log("[SSE] Aborted");
        return;
      }
      console.error("[SSE] Error:", error);
      onError(error);
    });

  return () => {
    abortController.abort();
  };
}

/**
 * Get list of available scripts in the project directory.
 */
export async function getAvailableScripts(): Promise<AvailableScript[]> {
  const response = await fetch(`${API_BASE}/api/scripts/available`);

  if (!response.ok) {
    console.error("Failed to fetch available scripts");
    return [];
  }

  const data = await response.json();
  return data.scripts || [];
}

// Re-export the AvailableScript type for convenience
export type { AvailableScript };

// ══════════════════════════════════════════════════════════
// Stage 3: Vapi Calling API
// ══════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════
// Project API
// ══════════════════════════════════════════════════════════

export async function listProjects(limit = 50): Promise<Project[]> {
  const response = await fetch(`${API_BASE}/api/projects?limit=${limit}`);
  if (!response.ok) throw new Error("Failed to fetch projects");
  return response.json();
}

export async function getProject(projectId: string): Promise<Project> {
  const response = await fetch(`${API_BASE}/api/projects/${projectId}`);
  if (!response.ok) throw new Error("Project not found");
  return response.json();
}

export async function createProject(data: CreateProjectRequest): Promise<Project> {
  const response = await fetch(`${API_BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to create project" }));
    throw new Error(error.detail);
  }
  return response.json();
}

export async function updateProject(
  projectId: string,
  updates: Partial<Project>
): Promise<Project> {
  const response = await fetch(`${API_BASE}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error("Failed to update project");
  return response.json();
}

export async function listProjectScenes(projectId: string): Promise<Scene[]> {
  const response = await fetch(`${API_BASE}/api/projects/${projectId}/scenes`);
  if (!response.ok) throw new Error("Failed to fetch scenes");
  return response.json();
}

// ══════════════════════════════════════════════════════════
// Location Candidates API
// ══════════════════════════════════════════════════════════

export async function listLocations(params: {
  projectId?: string;
  sceneId?: string;
  limit?: number;
}): Promise<LocationCandidate[]> {
  const query = new URLSearchParams();
  if (params.projectId) query.set("project_id", params.projectId);
  if (params.sceneId) query.set("scene_id", params.sceneId);
  if (params.limit) query.set("limit", params.limit.toString());

  const response = await fetch(`${API_BASE}/api/locations?${query}`);
  if (!response.ok) throw new Error("Failed to fetch locations");
  return response.json();
}

export async function getLocation(candidateId: string): Promise<LocationCandidate> {
  const response = await fetch(`${API_BASE}/api/locations/${candidateId}`);
  if (!response.ok) throw new Error("Location not found");
  return response.json();
}

export async function createMockLocation(
  data: CreateLocationRequest
): Promise<LocationCandidate> {
  const response = await fetch(`${API_BASE}/api/locations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to create location" }));
    throw new Error(error.detail);
  }
  return response.json();
}

export async function approveLocation(
  candidateId: string,
  approvedBy: string
): Promise<LocationCandidate> {
  const response = await fetch(
    `${API_BASE}/api/locations/${candidateId}/approve?approved_by=${encodeURIComponent(approvedBy)}`,
    { method: "PATCH" }
  );
  if (!response.ok) throw new Error("Failed to approve location");
  return response.json();
}

export async function rejectLocation(
  candidateId: string,
  reason: string
): Promise<LocationCandidate> {
  const response = await fetch(
    `${API_BASE}/api/locations/${candidateId}/reject?reason=${encodeURIComponent(reason)}`,
    { method: "PATCH" }
  );
  if (!response.ok) throw new Error("Failed to reject location");
  return response.json();
}

// ══════════════════════════════════════════════════════════
// Vapi Calls API
// ══════════════════════════════════════════════════════════

export async function triggerCall(candidateId: string): Promise<CallResponse> {
  const response = await fetch(`${API_BASE}/api/calls/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidate_id: candidateId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to trigger call" }));
    throw new Error(error.detail);
  }
  return response.json();
}

export async function triggerBatchCalls(
  candidateIds: string[],
  maxConcurrent?: number
): Promise<BatchResponse> {
  const response = await fetch(`${API_BASE}/api/calls/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      candidate_ids: candidateIds,
      max_concurrent: maxConcurrent,
    }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to trigger batch calls" }));
    throw new Error(error.detail);
  }
  return response.json();
}

export async function getCallStatus(vapiCallId: string): Promise<CallStatusResponse> {
  const response = await fetch(`${API_BASE}/api/calls/${vapiCallId}`);
  if (!response.ok) throw new Error("Failed to get call status");
  return response.json();
}

// ══════════════════════════════════════════════════════════
// Stage 2: Grounding API
// ══════════════════════════════════════════════════════════

/**
 * Get all scenes for a project that can be grounded.
 */
export async function getGroundableScenes(projectId: string): Promise<GroundableScene[]> {
  const response = await fetch(`${API_BASE}/api/grounding/scenes/${projectId}`);
  if (!response.ok) throw new Error("Failed to fetch scenes");
  return response.json();
}

/**
 * Ground multiple scenes with SSE streaming.
 */
export function groundScenesWithCallback(
  sceneIds: string[],
  targetCity: string,
  maxResults: number,
  saveToDb: boolean,
  onEvent: (event: GroundingSSEEvent) => void,
  onError: (error: Error) => void,
  onComplete: () => void
): () => void {
  const abortController = new AbortController();

  fetch(`${API_BASE}/api/grounding/ground`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      scene_ids: sceneIds,
      target_city: targetCity,
      max_results: maxResults,
      save_to_db: saveToDb,
    }),
    signal: abortController.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Grounding failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          onComplete();
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        let currentData = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            currentData = line.slice(5).trim();
          } else if (line === "" && currentEvent && currentData) {
            try {
              const parsedData = JSON.parse(currentData);
              onEvent({ type: currentEvent as GroundingSSEEvent["type"], data: parsedData });
            } catch (e) {
              console.error("Failed to parse SSE data:", currentData, e);
            }
            currentEvent = "";
            currentData = "";
          }
        }
      }
    })
    .catch((error) => {
      if (error.name === "AbortError") {
        return;
      }
      onError(error);
    });

  return () => {
    abortController.abort();
  };
}
