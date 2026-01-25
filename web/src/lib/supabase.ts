/**
 * Supabase client for real-time updates during Vapi calls.
 * Subscribes to location_candidates table for live call status.
 */

import { type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { LocationCandidate } from "./types";

// Lazy-loaded client singleton
let supabaseClient: SupabaseClient | null = null;

// Check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// Get Supabase client (lazy load to avoid SSG issues)
function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") {
    // Don't create client during SSR/SSG
    return null;
  }

  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!supabaseClient) {
    // Dynamically import to avoid SSG issues
    const { createClient } = require("@/utils/supabase/client");
    supabaseClient = createClient();
  }

  return supabaseClient;
}

// Export for direct access if needed
export const supabase = {
  get client() {
    return getSupabase();
  },
};

/**
 * Subscribe to location candidate updates for a specific project.
 * Use this to get real-time call status updates (ringing, in_progress, completed).
 *
 * @param projectId - The project ID to filter updates
 * @param onUpdate - Callback when a location candidate is updated
 * @returns Cleanup function to unsubscribe
 */
export function subscribeToLocationUpdates(
  projectId: string,
  onUpdate: (candidate: LocationCandidate) => void
): () => void {
  const client = getSupabase();
  if (!client) {
    console.warn("Supabase not configured - real-time updates disabled");
    return () => {};
  }

  const channel: RealtimeChannel = client
    .channel(`locations:${projectId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "location_candidates",
        filter: `project_id=eq.${projectId}`,
      },
      (payload) => {
        // payload.new contains the updated row
        onUpdate(payload.new as LocationCandidate);
      }
    )
    .subscribe();

  // Return cleanup function
  return () => {
    client.removeChannel(channel);
  };
}

/**
 * Subscribe to all location candidates for a project (INSERT, UPDATE, DELETE).
 * Use this for the full location grid that needs to react to all changes.
 *
 * @param projectId - The project ID to filter
 * @param callbacks - Object with optional callbacks for each event type
 * @returns Cleanup function to unsubscribe
 */
export function subscribeToAllLocationChanges(
  projectId: string,
  callbacks: {
    onInsert?: (candidate: LocationCandidate) => void;
    onUpdate?: (candidate: LocationCandidate) => void;
    onDelete?: (oldCandidate: LocationCandidate) => void;
  }
): () => void {
  const client = getSupabase();
  if (!client) {
    console.warn("Supabase not configured - real-time updates disabled");
    return () => {};
  }

  const channel: RealtimeChannel = client
    .channel(`all-locations:${projectId}`)
    .on(
      "postgres_changes",
      {
        event: "*", // All events
        schema: "public",
        table: "location_candidates",
        filter: `project_id=eq.${projectId}`,
      },
      (payload) => {
        switch (payload.eventType) {
          case "INSERT":
            callbacks.onInsert?.(payload.new as LocationCandidate);
            break;
          case "UPDATE":
            callbacks.onUpdate?.(payload.new as LocationCandidate);
            break;
          case "DELETE":
            callbacks.onDelete?.(payload.old as LocationCandidate);
            break;
        }
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

/**
 * Subscribe to a single location candidate for detailed status tracking.
 * Use this when viewing a specific location's call progress.
 *
 * @param candidateId - The location candidate ID
 * @param onUpdate - Callback when the candidate is updated
 * @returns Cleanup function to unsubscribe
 */
export function subscribeToSingleLocation(
  candidateId: string,
  onUpdate: (candidate: LocationCandidate) => void
): () => void {
  const client = getSupabase();
  if (!client) {
    console.warn("Supabase not configured - real-time updates disabled");
    return () => {};
  }

  const channel: RealtimeChannel = client
    .channel(`location:${candidateId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "location_candidates",
        filter: `id=eq.${candidateId}`,
      },
      (payload) => {
        onUpdate(payload.new as LocationCandidate);
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
