/**
 * API client for the Location Scout backend.
 * Handles script upload, analysis with SSE streaming, and script listing.
 */

import type { SSEEvent, AvailableScript, LocationRequirement } from "./types";

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

  // Start SSE connection
  fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "text/event-stream",
    },
    signal: abortController.signal,
  })
    .then(async (response) => {
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
          onComplete();
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        let currentEvent = "";
        let currentData = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            currentData = line.slice(5).trim();
          } else if (line === "" && currentEvent && currentData) {
            // End of event, process it
            try {
              const parsedData = JSON.parse(currentData);

              // Transform backend data to match frontend expectations
              if (currentEvent === "location") {
                // Map backend field names to frontend expectations
                const location = parsedData as Record<string, unknown>;
                const transformed: LocationRequirement = {
                  id: location.id as string,
                  scene_id: location.id as string, // Use id as scene_id
                  project_id: (location.project_id as string) || "",
                  scene_number: (location.scene_number as string) || "",
                  scene_header: (location.scene_header as string) || "",
                  page_numbers: (location.page_numbers as number[]) || [],
                  script_context: (location.script_excerpt as string) || "", // Map script_excerpt -> script_context
                  vibe: location.vibe as LocationRequirement["vibe"],
                  constraints: location.constraints as LocationRequirement["constraints"],
                  estimated_shoot_duration_hours: (location.estimated_shoot_hours as number) || 8, // Map estimated_shoot_hours -> estimated_shoot_duration_hours
                  priority: (location.priority as LocationRequirement["priority"]) || "important",
                  target_city: (location.target_city as string) || "Los Angeles, CA",
                  search_radius_km: (location.search_radius_km as number) || 50,
                  max_results: (location.max_results as number) || 10,
                  location_description: (location.location_description as string) || "",
                  scouting_notes: (location.scouting_notes as string) || "",
                };
                onEvent({ type: "location", data: transformed });
              } else {
                onEvent({ type: currentEvent as SSEEvent["type"], data: parsedData });
              }
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
        return; // Intentional abort, not an error
      }
      onError(error);
    });

  // Return cleanup function
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
