"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  listProjects,
  listLocations,
  triggerCall,
  triggerBatchCalls,
  approveLocation,
  rejectLocation,
} from "@/lib/api";
import {
  subscribeToLocationUpdates,
  isSupabaseConfigured,
} from "@/lib/supabase";
import type { Project, LocationCandidate } from "@/lib/types";
import LocationCandidateGrid from "@/components/LocationCandidateGrid";

// Inner component that uses useSearchParams
function CallsDashboardContent() {
  const searchParams = useSearchParams();
  const projectIdParam = searchParams.get("project");

  // State
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [locations, setLocations] = useState<LocationCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batchInProgress, setBatchInProgress] = useState(false);

  // Load projects on mount
  useEffect(() => {
    listProjects()
      .then((data) => {
        setProjects(data);
        // Auto-select from URL param or first project
        if (projectIdParam && data.some((p) => p.id === projectIdParam)) {
          setSelectedProjectId(projectIdParam);
        } else if (data.length > 0) {
          setSelectedProjectId(data[0].id);
        }
      })
      .catch((err) => {
        console.error("Failed to load projects:", err);
        setError("Failed to load projects");
      })
      .finally(() => setIsLoading(false));
  }, [projectIdParam]);

  // Load locations when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setLocations([]);
      return;
    }

    setIsLoading(true);
    listLocations({ projectId: selectedProjectId })
      .then(setLocations)
      .catch((err) => {
        console.error("Failed to load locations:", err);
        setError("Failed to load locations");
      })
      .finally(() => setIsLoading(false));
  }, [selectedProjectId]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!selectedProjectId || !isSupabaseConfigured()) return;

    const unsubscribe = subscribeToLocationUpdates(
      selectedProjectId,
      (updatedLocation) => {
        setLocations((prev) =>
          prev.map((loc) =>
            loc.id === updatedLocation.id ? updatedLocation : loc
          )
        );
      }
    );

    return unsubscribe;
  }, [selectedProjectId]);

  // Computed values
  const callableLocations = useMemo(
    () =>
      locations.filter(
        (loc) =>
          loc.vapi_call_status === "not_initiated" &&
          loc.phone_number &&
          loc.status === "discovered"
      ),
    [locations]
  );

  const selectedCallable = useMemo(
    () => callableLocations.filter((loc) => selectedIds.has(loc.id)),
    [callableLocations, selectedIds]
  );

  const completedCalls = useMemo(
    () => locations.filter((loc) => loc.vapi_call_status === "completed"),
    [locations]
  );

  const inProgressCalls = useMemo(
    () =>
      locations.filter(
        (loc) =>
          loc.vapi_call_status === "queued" ||
          loc.vapi_call_status === "ringing" ||
          loc.vapi_call_status === "in_progress"
      ),
    [locations]
  );

  // Handlers
  const handleSelect = useCallback((id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === callableLocations.length) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all callable
      setSelectedIds(new Set(callableLocations.map((loc) => loc.id)));
    }
  }, [callableLocations, selectedIds.size]);

  const handleTriggerCall = useCallback(async (candidateId: string) => {
    try {
      await triggerCall(candidateId);
      // Status will update via real-time subscription
    } catch (err) {
      console.error("Failed to trigger call:", err);
      setError("Failed to trigger call");
    }
  }, []);

  const handleTriggerBatch = useCallback(async () => {
    if (selectedCallable.length === 0) return;

    setBatchInProgress(true);
    try {
      await triggerBatchCalls(
        selectedCallable.map((loc) => loc.id),
        5 // Max concurrent
      );
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Failed to trigger batch calls:", err);
      setError("Failed to trigger batch calls");
    } finally {
      setBatchInProgress(false);
    }
  }, [selectedCallable]);

  const handleApprove = useCallback(async (candidateId: string) => {
    try {
      await approveLocation(candidateId, "user"); // TODO: Get actual user
    } catch (err) {
      console.error("Failed to approve:", err);
      setError("Failed to approve location");
    }
  }, []);

  const handleReject = useCallback(async (candidateId: string, reason: string) => {
    try {
      await rejectLocation(candidateId, reason);
    } catch (err) {
      console.error("Failed to reject:", err);
      setError("Failed to reject location");
    }
  }, []);

  // Render
  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--color-bg)",
      }}
    >
      {/* Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backgroundColor: "var(--color-bg-elevated)",
          borderBottom: "1px solid var(--color-border)",
          padding: "1rem 1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: "1400px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.25rem",
                fontWeight: 600,
                color: "var(--color-text)",
              }}
            >
              Voice Outreach
            </h1>
            <p
              style={{
                fontSize: "0.8125rem",
                color: "var(--color-text-muted)",
              }}
            >
              Call venues to check availability and pricing
            </p>
          </div>

          {/* Project selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <label
              style={{
                fontSize: "0.75rem",
                fontWeight: 500,
                color: "var(--color-text-muted)",
              }}
            >
              Project:
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              style={{
                padding: "0.5rem 0.75rem",
                border: "1px solid var(--color-border)",
                borderRadius: "4px",
                backgroundColor: "var(--color-bg)",
                fontSize: "0.875rem",
                minWidth: "200px",
              }}
            >
              <option value="">Select a project...</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>

            {/* Link back to home */}
            <a
              href="/"
              style={{
                padding: "0.5rem 0.75rem",
                color: "var(--color-text-muted)",
                fontSize: "0.875rem",
                textDecoration: "none",
              }}
            >
              Script Analysis
            </a>
          </div>
        </div>
      </header>

      {/* Content */}
      <div
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
          padding: "1.5rem",
        }}
      >
        {/* Error message */}
        {error && (
          <div
            style={{
              marginBottom: "1rem",
              padding: "0.75rem 1rem",
              backgroundColor: "rgba(155, 59, 59, 0.1)",
              border: "1px solid var(--color-error)",
              borderRadius: "6px",
              color: "var(--color-error)",
              fontSize: "0.875rem",
            }}
          >
            {error}
            <button
              onClick={() => setError(null)}
              style={{
                marginLeft: "0.5rem",
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              &times;
            </button>
          </div>
        )}

        {/* Batch actions panel */}
        {selectedProjectId && locations.length > 0 && (
          <div
            className="paper-card"
            style={{
              marginBottom: "1.5rem",
              padding: "1rem 1.25rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "1rem",
              }}
            >
              {/* Left: Select all and count */}
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={
                      callableLocations.length > 0 &&
                      selectedIds.size === callableLocations.length
                    }
                    onChange={handleSelectAll}
                    disabled={callableLocations.length === 0}
                    style={{ width: "1rem", height: "1rem" }}
                  />
                  Select All Callable ({callableLocations.length})
                </label>

                {/* Stats */}
                <div
                  style={{
                    display: "flex",
                    gap: "1rem",
                    fontSize: "0.75rem",
                    color: "var(--color-text-muted)",
                  }}
                >
                  <span>
                    <strong style={{ color: "var(--color-success)" }}>
                      {completedCalls.length}
                    </strong>{" "}
                    completed
                  </span>
                  <span>
                    <strong style={{ color: "var(--color-warning)" }}>
                      {inProgressCalls.length}
                    </strong>{" "}
                    in progress
                  </span>
                  <span>
                    <strong>{locations.length}</strong> total
                  </span>
                </div>
              </div>

              {/* Right: Batch call button */}
              <button
                onClick={handleTriggerBatch}
                disabled={selectedCallable.length === 0 || batchInProgress}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.625rem 1rem",
                  backgroundColor:
                    selectedCallable.length > 0 && !batchInProgress
                      ? "var(--color-accent)"
                      : "var(--color-border)",
                  color:
                    selectedCallable.length > 0 && !batchInProgress
                      ? "white"
                      : "var(--color-text-muted)",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  cursor:
                    selectedCallable.length > 0 && !batchInProgress
                      ? "pointer"
                      : "not-allowed",
                }}
              >
                <svg
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                {batchInProgress
                  ? "Calling..."
                  : `Call Selected (${selectedCallable.length})`}
              </button>
            </div>

            {/* Progress bar for batch calls */}
            {inProgressCalls.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "0.375rem",
                    fontSize: "0.75rem",
                    color: "var(--color-text-muted)",
                  }}
                >
                  <span>Calls in progress</span>
                  <span>
                    {completedCalls.length} / {completedCalls.length + inProgressCalls.length + callableLocations.length}
                  </span>
                </div>
                <div
                  style={{
                    height: "6px",
                    backgroundColor: "var(--color-bg-muted)",
                    borderRadius: "3px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${
                        (completedCalls.length /
                          (completedCalls.length +
                            inProgressCalls.length +
                            callableLocations.length)) *
                        100
                      }%`,
                      backgroundColor: "var(--color-accent)",
                      borderRadius: "3px",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div
            style={{
              textAlign: "center",
              padding: "3rem",
              color: "var(--color-text-muted)",
            }}
          >
            <div className="animate-spin" style={{ marginBottom: "1rem" }}>
              <svg
                width={32}
                height={32}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
            </div>
            <p>Loading...</p>
          </div>
        )}

        {/* No project selected */}
        {!isLoading && !selectedProjectId && (
          <div
            style={{
              textAlign: "center",
              padding: "3rem",
              color: "var(--color-text-muted)",
            }}
          >
            <svg
              width={48}
              height={48}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              style={{ margin: "0 auto 1rem", opacity: 0.5 }}
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <p style={{ marginBottom: "0.5rem" }}>
              {projects.length === 0
                ? "No projects found. Create a project first."
                : "Select a project to view locations."}
            </p>
            <a
              href="/projects"
              style={{
                color: "var(--color-accent)",
                textDecoration: "none",
                fontSize: "0.875rem",
              }}
            >
              Go to Projects &rarr;
            </a>
          </div>
        )}

        {/* Location grid */}
        {!isLoading && selectedProjectId && (
          <LocationCandidateGrid
            candidates={locations}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            onTriggerCall={handleTriggerCall}
            onApprove={handleApprove}
            onReject={handleReject}
            emptyMessage="No locations found for this project. Run the grounding stage first."
          />
        )}
      </div>
    </main>
  );
}

// Default export with Suspense boundary for useSearchParams
export default function CallsDashboard() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--color-bg)",
          }}
        >
          <div className="animate-spin">
            <svg
              width={32}
              height={32}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          </div>
        </div>
      }
    >
      <CallsDashboardContent />
    </Suspense>
  );
}
