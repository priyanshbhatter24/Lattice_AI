"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  listProjects,
  getGroundableScenes,
  groundScenesWithCallback,
} from "@/lib/api";
import type {
  Project,
  GroundableScene,
  LocationCandidate,
  GroundingSSEEvent,
} from "@/lib/types";

// ══════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════

type GroundingState = "idle" | "selecting" | "grounding" | "complete";

interface SceneResult {
  scene_id: string;
  scene_header: string;
  candidates: LocationCandidate[];
  query_used?: string;
  processing_time?: number;
  errors?: string[];
  warnings?: string[];
}

// ══════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════

function GroundingPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectIdParam = searchParams.get("project");

  // State
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [scenes, setScenes] = useState<GroundableScene[]>([]);
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(new Set());
  const [targetCity, setTargetCity] = useState("Los Angeles, CA");
  const [maxResults, setMaxResults] = useState(10);

  // Grounding state
  const [groundingState, setGroundingState] = useState<GroundingState>("idle");
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [currentSceneHeader, setCurrentSceneHeader] = useState("");
  const [progress, setProgress] = useState({ processed: 0, total: 0, percent: 0 });
  const [sceneResults, setSceneResults] = useState<Map<string, SceneResult>>(new Map());
  const [statusMessage, setStatusMessage] = useState("");

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());

  // Load projects
  useEffect(() => {
    listProjects()
      .then((data) => {
        setProjects(data);
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

  // Load scenes when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setScenes([]);
      return;
    }

    setIsLoading(true);
    getGroundableScenes(selectedProjectId)
      .then((data) => {
        setScenes(data);
        // Auto-select scenes without candidates
        const pendingIds = data
          .filter((s) => !s.has_candidates)
          .map((s) => s.id);
        setSelectedSceneIds(new Set(pendingIds));
      })
      .catch((err) => {
        console.error("Failed to load scenes:", err);
        setError("Failed to load scenes");
      })
      .finally(() => setIsLoading(false));
  }, [selectedProjectId]);

  // Get selected project's target city
  useEffect(() => {
    const project = projects.find((p) => p.id === selectedProjectId);
    if (project?.target_city) {
      setTargetCity(project.target_city);
    }
  }, [selectedProjectId, projects]);

  // Computed values
  const pendingScenes = useMemo(
    () => scenes.filter((s) => !s.has_candidates),
    [scenes]
  );

  const groundedScenes = useMemo(
    () => scenes.filter((s) => s.has_candidates),
    [scenes]
  );

  const selectedScenes = useMemo(
    () => scenes.filter((s) => selectedSceneIds.has(s.id)),
    [scenes, selectedSceneIds]
  );

  const totalCandidatesFound = useMemo(() => {
    let total = 0;
    sceneResults.forEach((result) => {
      total += result.candidates.length;
    });
    return total;
  }, [sceneResults]);

  // Handlers
  const handleSceneSelect = useCallback((sceneId: string, selected: boolean) => {
    setSelectedSceneIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(sceneId);
      } else {
        next.delete(sceneId);
      }
      return next;
    });
  }, []);

  const handleSelectAllPending = useCallback(() => {
    if (selectedSceneIds.size === pendingScenes.length) {
      setSelectedSceneIds(new Set());
    } else {
      setSelectedSceneIds(new Set(pendingScenes.map((s) => s.id)));
    }
  }, [pendingScenes, selectedSceneIds.size]);

  const handleStartGrounding = useCallback(() => {
    if (selectedSceneIds.size === 0) return;

    setGroundingState("grounding");
    setSceneResults(new Map());
    setProgress({ processed: 0, total: selectedSceneIds.size, percent: 0 });
    setError(null);

    const cleanup = groundScenesWithCallback(
      Array.from(selectedSceneIds),
      targetCity,
      maxResults,
      true, // save to DB
      (event: GroundingSSEEvent) => {
        switch (event.type) {
          case "status":
            setStatusMessage(event.data.message);
            break;

          case "scene_start":
            setCurrentSceneIndex(event.data.index);
            setCurrentSceneHeader(event.data.scene_header);
            setStatusMessage(`Processing: ${event.data.scene_header}`);
            // Initialize result for this scene
            setSceneResults((prev) => {
              const next = new Map(prev);
              next.set(event.data.scene_id, {
                scene_id: event.data.scene_id,
                scene_header: event.data.scene_header,
                candidates: [],
              });
              return next;
            });
            break;

          case "candidate":
            setSceneResults((prev) => {
              const next = new Map(prev);
              const result = next.get(event.data.scene_id);
              if (result) {
                result.candidates = [...result.candidates, event.data.candidate];
                next.set(event.data.scene_id, result);
              }
              return next;
            });
            break;

          case "scene_complete":
            setSceneResults((prev) => {
              const next = new Map(prev);
              const result = next.get(event.data.scene_id);
              if (result) {
                result.query_used = event.data.query_used;
                result.processing_time = event.data.processing_time;
                result.errors = event.data.errors;
                result.warnings = event.data.warnings;
                next.set(event.data.scene_id, result);
              }
              return next;
            });
            break;

          case "progress":
            setProgress({
              processed: event.data.processed,
              total: event.data.total,
              percent: event.data.percent,
            });
            break;

          case "complete":
            setGroundingState("complete");
            setStatusMessage(event.data.message);
            break;

          case "error":
            if (event.data.scene_id) {
              const errorSceneId = event.data.scene_id;
              setSceneResults((prev) => {
                const next = new Map(prev);
                const result = next.get(errorSceneId);
                if (result) {
                  result.errors = [event.data.error];
                  next.set(errorSceneId, result);
                }
                return next;
              });
            } else {
              setError(event.data.error);
            }
            break;
        }
      },
      (err: Error) => {
        setError(err.message);
        setGroundingState("idle");
      },
      () => {
        // Stream closed
      }
    );

    return cleanup;
  }, [selectedSceneIds, targetCity, maxResults]);

  const handleReset = useCallback(() => {
    setGroundingState("idle");
    setSceneResults(new Map());
    setProgress({ processed: 0, total: 0, percent: 0 });
    setStatusMessage("");
    setSelectedSceneIds(new Set(pendingScenes.map((s) => s.id)));
  }, [pendingScenes]);

  const toggleSceneExpanded = useCallback((sceneId: string) => {
    setExpandedScenes((prev) => {
      const next = new Set(prev);
      if (next.has(sceneId)) {
        next.delete(sceneId);
      } else {
        next.add(sceneId);
      }
      return next;
    });
  }, []);

  // Render
  return (
    <main style={{ minHeight: "100vh", backgroundColor: "var(--color-bg)" }}>
      {/* Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backgroundColor: "rgba(247, 243, 235, 0.95)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div
          style={{
            maxWidth: "1400px",
            margin: "0 auto",
            padding: "1rem 1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "2.25rem",
                height: "2.25rem",
                borderRadius: "50%",
                backgroundColor: "var(--color-text)",
                color: "var(--color-bg-elevated)",
              }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="10" r="3" />
                <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z" />
              </svg>
            </div>
            <div>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: "var(--color-text)",
                }}
              >
                Location Discovery
              </h1>
              <p
                style={{
                  fontSize: "0.6875rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--color-text-subtle)",
                }}
              >
                Stage 2: Find Real Venues
              </p>
            </div>
          </div>

          {/* Navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {/* Project selector */}
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              disabled={groundingState === "grounding"}
              style={{
                padding: "0.5rem 0.75rem",
                border: "1px solid var(--color-border)",
                borderRadius: "4px",
                backgroundColor: "var(--color-bg)",
                fontSize: "0.875rem",
                minWidth: "180px",
              }}
            >
              <option value="">Select project...</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>

            {/* Nav links */}
            <nav style={{ display: "flex", gap: "0.5rem" }}>
              <a
                href="/"
                style={{
                  padding: "0.5rem 0.75rem",
                  color: "var(--color-text-muted)",
                  fontSize: "0.8125rem",
                  textDecoration: "none",
                  borderRadius: "4px",
                }}
              >
                Script Analysis
              </a>
              <a
                href={`/calls${selectedProjectId ? `?project=${selectedProjectId}` : ""}`}
                style={{
                  padding: "0.5rem 0.75rem",
                  color: "var(--color-text-muted)",
                  fontSize: "0.8125rem",
                  textDecoration: "none",
                  borderRadius: "4px",
                }}
              >
                Voice Outreach
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Content */}
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "1.5rem" }}>
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
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: "0.25rem" }}
            >
              &times;
            </button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-muted)" }}>
            <div className="animate-spin" style={{ marginBottom: "1rem", display: "inline-block" }}>
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
            </div>
            <p>Loading...</p>
          </div>
        )}

        {/* No project selected */}
        {!isLoading && !selectedProjectId && (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-muted)" }}>
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
                ? "No projects found. Create a project and analyze a script first."
                : "Select a project to discover locations."}
            </p>
            <a href="/projects" style={{ color: "var(--color-accent)", textDecoration: "none", fontSize: "0.875rem" }}>
              Go to Projects &rarr;
            </a>
          </div>
        )}

        {/* No scenes */}
        {!isLoading && selectedProjectId && scenes.length === 0 && (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-muted)" }}>
            <svg
              width={48}
              height={48}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              style={{ margin: "0 auto 1rem", opacity: 0.5 }}
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p style={{ marginBottom: "0.5rem" }}>
              No scenes found. Analyze a script first to extract locations.
            </p>
            <a href="/" style={{ color: "var(--color-accent)", textDecoration: "none", fontSize: "0.875rem" }}>
              Go to Script Analysis &rarr;
            </a>
          </div>
        )}

        {/* Main content - Scene selection & Grounding */}
        {!isLoading && selectedProjectId && scenes.length > 0 && (
          <>
            {/* Controls Panel */}
            {groundingState !== "grounding" && (
              <div className="paper-card" style={{ marginBottom: "1.5rem", padding: "1.25rem" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", alignItems: "flex-end" }}>
                  {/* Target City */}
                  <div style={{ flex: "1 1 200px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.6875rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--color-text-muted)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Target City
                    </label>
                    <input
                      type="text"
                      value={targetCity}
                      onChange={(e) => setTargetCity(e.target.value)}
                      placeholder="e.g., Los Angeles, CA"
                      style={{
                        width: "100%",
                        padding: "0.625rem 0.75rem",
                        border: "1px solid var(--color-border)",
                        borderRadius: "4px",
                        fontSize: "0.875rem",
                        backgroundColor: "var(--color-bg)",
                      }}
                    />
                  </div>

                  {/* Max Results */}
                  <div style={{ flex: "0 0 120px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.6875rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--color-text-muted)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Results/Scene
                    </label>
                    <select
                      value={maxResults}
                      onChange={(e) => setMaxResults(Number(e.target.value))}
                      style={{
                        width: "100%",
                        padding: "0.625rem 0.75rem",
                        border: "1px solid var(--color-border)",
                        borderRadius: "4px",
                        fontSize: "0.875rem",
                        backgroundColor: "var(--color-bg)",
                      }}
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value={20}>20</option>
                    </select>
                  </div>

                  {/* Scene Selection */}
                  <div style={{ flex: "1 1 200px" }}>
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
                        checked={pendingScenes.length > 0 && selectedSceneIds.size === pendingScenes.length}
                        onChange={handleSelectAllPending}
                        disabled={pendingScenes.length === 0}
                        style={{ width: "1rem", height: "1rem" }}
                      />
                      Select All Pending ({pendingScenes.length})
                    </label>
                    <p style={{ fontSize: "0.75rem", color: "var(--color-text-subtle)", marginTop: "0.25rem" }}>
                      {selectedSceneIds.size} scene{selectedSceneIds.size !== 1 ? "s" : ""} selected
                    </p>
                  </div>

                  {/* Start Button */}
                  <button
                    onClick={handleStartGrounding}
                    disabled={selectedSceneIds.size === 0}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.75rem 1.5rem",
                      backgroundColor: selectedSceneIds.size > 0 ? "var(--color-accent)" : "var(--color-border)",
                      color: selectedSceneIds.size > 0 ? "white" : "var(--color-text-muted)",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      cursor: selectedSceneIds.size > 0 ? "pointer" : "not-allowed",
                    }}
                  >
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="10" r="3" />
                      <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z" />
                    </svg>
                    Discover Locations
                  </button>
                </div>
              </div>
            )}

            {/* Grounding Progress */}
            {groundingState === "grounding" && (
              <div className="paper-card animate-fade-in" style={{ marginBottom: "1.5rem", overflow: "hidden" }}>
                {/* Header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "1rem 1.25rem",
                    borderBottom: "1px solid var(--color-border-subtle)",
                    backgroundColor: "var(--color-bg-muted)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{ position: "relative" }}>
                      <div
                        style={{
                          width: "2.5rem",
                          height: "2.5rem",
                          borderRadius: "50%",
                          backgroundColor: "var(--color-accent-light)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg
                          width={18}
                          height={18}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--color-accent)"
                          strokeWidth={2}
                          className="animate-spin"
                        >
                          <path d="M21 12a9 9 0 11-6.219-8.56" />
                        </svg>
                      </div>
                    </div>
                    <div>
                      <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text)" }}>
                        Discovering Locations
                      </p>
                      <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                        {currentSceneHeader || "Initializing..."}
                      </p>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--color-accent)",
                    }}
                  >
                    Processing
                  </div>
                </div>

                {/* Progress */}
                <div style={{ padding: "1rem 1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                      Scene {progress.processed} of {progress.total}
                    </span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-accent)" }}>
                      {progress.percent}%
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
                        width: `${progress.percent}%`,
                        backgroundColor: "var(--color-accent)",
                        borderRadius: "3px",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.75rem" }}>
                    {statusMessage}
                  </p>
                </div>

                {/* Live candidate count */}
                <div
                  style={{
                    padding: "0.75rem 1.25rem",
                    borderTop: "1px solid var(--color-border-subtle)",
                    backgroundColor: "var(--color-bg)",
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth={2}>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
                      <strong style={{ color: "var(--color-success)" }}>{totalCandidatesFound}</strong> venues discovered
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Completion state */}
            {groundingState === "complete" && (
              <div className="paper-card animate-fade-in" style={{ marginBottom: "1.5rem", padding: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div
                      style={{
                        width: "2.5rem",
                        height: "2.5rem",
                        borderRadius: "50%",
                        backgroundColor: "var(--color-success-light)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth={2.5}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div>
                      <p style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-text)" }}>
                        Discovery Complete
                      </p>
                      <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
                        Found {totalCandidatesFound} venues across {sceneResults.size} scenes
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <button
                      onClick={handleReset}
                      style={{
                        padding: "0.625rem 1rem",
                        backgroundColor: "transparent",
                        color: "var(--color-text-secondary)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "6px",
                        fontSize: "0.8125rem",
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      Discover More
                    </button>
                    <button
                      onClick={() => router.push(`/calls?project=${selectedProjectId}`)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.375rem",
                        padding: "0.625rem 1rem",
                        backgroundColor: "var(--color-accent)",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "0.8125rem",
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      Start Calling
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Scene List */}
            <div style={{ display: "grid", gap: "1rem" }}>
              {/* Pending Scenes Header */}
              {pendingScenes.length > 0 && groundingState === "idle" && (
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1rem",
                    fontWeight: 600,
                    color: "var(--color-text)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Pending Scenes ({pendingScenes.length})
                </h2>
              )}

              {/* Scene Cards - Show pending when idle, show results when grounding/complete */}
              {(groundingState === "idle" ? pendingScenes : Array.from(sceneResults.values())).map((item) => {
                const isResult = "candidates" in item;
                const scene = isResult
                  ? scenes.find((s) => s.id === (item as SceneResult).scene_id)
                  : (item as GroundableScene);
                const result = isResult ? (item as SceneResult) : null;

                if (!scene) return null;

                const isSelected = selectedSceneIds.has(scene.id);
                const isExpanded = expandedScenes.has(scene.id);
                const candidates = result?.candidates || [];

                return (
                  <div key={scene.id} className="paper-card animate-fade-in" style={{ overflow: "hidden" }}>
                    {/* Scene Header */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "1rem",
                        padding: "1rem 1.25rem",
                        backgroundColor: "var(--color-bg-muted)",
                        borderBottom: "1px solid var(--color-border-subtle)",
                      }}
                    >
                      {/* Checkbox (only in idle state) */}
                      {groundingState === "idle" && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSceneSelect(scene.id, e.target.checked)}
                          style={{ width: "1rem", height: "1rem", cursor: "pointer" }}
                        />
                      )}

                      {/* Scene info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3
                          className="scene-header"
                          style={{
                            fontSize: "0.8125rem",
                            color: "var(--color-text)",
                            marginBottom: "0.25rem",
                          }}
                        >
                          {scene.scene_header}
                        </h3>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                          <span className="tag tag-primary">{scene.vibe?.primary || "unknown"}</span>
                          <span
                            style={{
                              fontSize: "0.6875rem",
                              color: scene.constraints?.interior_exterior === "interior"
                                ? "var(--color-interior)"
                                : "var(--color-exterior)",
                              fontWeight: 500,
                              textTransform: "uppercase",
                            }}
                          >
                            {scene.constraints?.interior_exterior}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "var(--color-text-subtle)" }}>
                            pg {scene.page_numbers?.join(", ") || "?"}
                          </span>
                        </div>
                      </div>

                      {/* Result stats (when grounding/complete) */}
                      {result && (
                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-success)" }}>
                            {candidates.length} found
                          </p>
                          {result.processing_time && (
                            <p style={{ fontSize: "0.6875rem", color: "var(--color-text-subtle)" }}>
                              {result.processing_time.toFixed(1)}s
                            </p>
                          )}
                        </div>
                      )}

                      {/* Expand button (when has candidates) */}
                      {candidates.length > 0 && (
                        <button
                          onClick={() => toggleSceneExpanded(scene.id)}
                          style={{
                            padding: "0.5rem",
                            backgroundColor: "transparent",
                            border: "1px solid var(--color-border)",
                            borderRadius: "4px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <svg
                            width={16}
                            height={16}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="var(--color-text-muted)"
                            strokeWidth={2}
                            style={{
                              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                              transition: "transform 0.2s ease",
                            }}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Expanded Candidates */}
                    {isExpanded && candidates.length > 0 && (
                      <div style={{ padding: "1rem 1.25rem" }}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                            gap: "0.75rem",
                          }}
                        >
                          {candidates.map((candidate) => (
                            <CandidateCard key={candidate.id} candidate={candidate} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Already Grounded Scenes */}
              {groundedScenes.length > 0 && groundingState === "idle" && (
                <>
                  <h2
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: "var(--color-text)",
                      marginTop: "1rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Already Discovered ({groundedScenes.length})
                  </h2>
                  {groundedScenes.map((scene) => (
                    <div
                      key={scene.id}
                      className="paper-card"
                      style={{ padding: "1rem 1.25rem", opacity: 0.7 }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <h3
                            className="scene-header"
                            style={{ fontSize: "0.8125rem", color: "var(--color-text)", marginBottom: "0.25rem" }}
                          >
                            {scene.scene_header}
                          </h3>
                          <span className="tag tag-muted">{scene.vibe?.primary}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontSize: "0.8125rem", color: "var(--color-success)", fontWeight: 500 }}>
                            {scene.candidate_count} venues
                          </span>
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth={2}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

// ══════════════════════════════════════════════════════════
// Candidate Card Component
// ══════════════════════════════════════════════════════════

function CandidateCard({ candidate }: { candidate: LocationCandidate }) {
  return (
    <div
      style={{
        backgroundColor: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "6px",
        padding: "0.875rem",
      }}
    >
      {/* Name & Score */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
        <h4
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "var(--color-text)",
            lineHeight: 1.3,
            flex: 1,
            marginRight: "0.5rem",
          }}
        >
          {candidate.venue_name}
        </h4>
        <span
          style={{
            fontSize: "0.6875rem",
            fontWeight: 600,
            color: candidate.match_score >= 0.7 ? "var(--color-success)" : "var(--color-warning)",
            whiteSpace: "nowrap",
          }}
        >
          {Math.round(candidate.match_score * 100)}%
        </span>
      </div>

      {/* Address */}
      <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: "0.5rem", lineHeight: 1.4 }}>
        {candidate.formatted_address}
      </p>

      {/* Details row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", fontSize: "0.6875rem", color: "var(--color-text-subtle)" }}>
        {candidate.phone_number && (
          <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            Has phone
          </span>
        )}
        {candidate.google_rating && (
          <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <svg width={10} height={10} viewBox="0 0 24 24" fill="var(--color-warning)" stroke="none">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            {candidate.google_rating.toFixed(1)}
          </span>
        )}
        {!candidate.phone_number && (
          <span style={{ color: "var(--color-error)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            No phone
          </span>
        )}
      </div>

      {/* Match reasoning */}
      {candidate.match_reasoning && (
        <p
          style={{
            fontSize: "0.6875rem",
            color: "var(--color-text-secondary)",
            marginTop: "0.5rem",
            lineHeight: 1.4,
            borderTop: "1px solid var(--color-border-subtle)",
            paddingTop: "0.5rem",
          }}
        >
          {candidate.match_reasoning}
        </p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Export with Suspense
// ══════════════════════════════════════════════════════════

export default function GroundingPage() {
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
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth={2}>
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          </div>
        </div>
      }
    >
      <GroundingPageContent />
    </Suspense>
  );
}
