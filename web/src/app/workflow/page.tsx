"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  uploadScript,
  analyzeScriptWithCallback,
  getAvailableScripts,
  listProjects,
  createProject,
  bulkSaveScenesToProject,
  groundScenesWithCallback,
  type AvailableScript,
} from "@/lib/api";
import type { LocationRequirement, AnalysisProgress, SSEEvent, Project, LocationCandidate, GroundingSSEEvent } from "@/lib/types";

type AppState = "idle" | "uploading" | "analyzing" | "complete" | "grounding" | "grounded";
type AnalysisPhase = "parsing" | "deduplicating" | "analyzing" | "complete";

const ANALYSIS_STEPS = [
  { phase: "parsing", label: "Parse", sublabel: "Extract scenes" },
  { phase: "deduplicating", label: "Merge", sublabel: "Deduplicate" },
  { phase: "analyzing", label: "Analyze", sublabel: "AI processing" },
  { phase: "complete", label: "Done", sublabel: "Complete" },
] as const;

export default function Home() {
  const router = useRouter();
  const [state, setState] = useState<AppState>("idle");
  const [selectedScript, setSelectedScript] = useState<{ name: string; path: string } | null>(null);
  const [availableScripts, setAvailableScripts] = useState<AvailableScript[]>([]);
  const [status, setStatus] = useState("");
  const [currentPhase, setCurrentPhase] = useState<AnalysisPhase>("parsing");
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [locations, setLocations] = useState<LocationRequirement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [totalLocations, setTotalLocations] = useState<number | null>(null);
  const [dedupeAnimation, setDedupeAnimation] = useState<{ before: number; after: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const phaseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialLocationCountRef = useRef<number>(0);

  // Selection state
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set());

  // Grounding state
  const [groundingProgress, setGroundingProgress] = useState({ processed: 0, total: 0, percent: 0 });
  const [currentGroundingScene, setCurrentGroundingScene] = useState("");
  const [venuesByScene, setVenuesByScene] = useState<Map<string, LocationCandidate>>(new Map());
  const [allVenues, setAllVenues] = useState<LocationCandidate[]>([]); // All discovered venues
  const [latestVenueId, setLatestVenueId] = useState<string | null>(null); // Most recent venue ID
  const [consideringVenue, setConsideringVenue] = useState<LocationCandidate | null>(null); // Currently evaluating
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [savedSceneIds, setSavedSceneIds] = useState<string[]>([]);

  useEffect(() => {
    getAvailableScripts().then(setAvailableScripts).catch(console.error);
  }, []);

  // Auto-select all locations when analysis completes
  useEffect(() => {
    if (state === "complete" && locations.length > 0) {
      setSelectedLocationIds(new Set(locations.map(l => l.scene_id)));
    }
  }, [state, locations]);

  const handleSelectLocation = useCallback((sceneId: string, selected: boolean) => {
    setSelectedLocationIds(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(sceneId);
      } else {
        next.delete(sceneId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedLocationIds.size === locations.length) {
      setSelectedLocationIds(new Set());
    } else {
      setSelectedLocationIds(new Set(locations.map(l => l.scene_id)));
    }
  }, [locations, selectedLocationIds.size]);

  const handleFindRealVenues = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    console.log("[FindVenues] Starting with", selectedLocationIds.size, "locations selected");

    if (selectedLocationIds.size === 0) {
      console.log("[FindVenues] No locations selected, returning");
      return;
    }

    const selectedLocations = locations.filter(l => selectedLocationIds.has(l.scene_id));
    console.log("[FindVenues] Selected locations:", selectedLocations.length);

    // Create project and save scenes
    setError(null);
    setState("grounding");
    setVenuesByScene(new Map());
    setAllVenues([]);
    setLatestVenueId(null);
    setConsideringVenue(null);
    setGroundingProgress({ processed: 0, total: selectedLocations.length, percent: 0 });

    try {
      // Create a new project
      const projectName = selectedScript?.name.replace(/\.pdf$/i, "") || "Untitled Project";
      console.log("[FindVenues] Creating project:", projectName);

      const newProject = await createProject({
        name: projectName,
        company_name: "Location Scout",
        target_city: "Los Angeles, CA",
      });

      console.log("[FindVenues] Project created:", newProject.id);
      setSavedProjectId(newProject.id);

      // Save selected locations to the project
      console.log("[FindVenues] Saving locations to project...");
      const result = await bulkSaveScenesToProject(
        newProject.id,
        selectedLocations.map((loc) => ({
          ...loc,
          project_id: newProject.id,
        }))
      );

      console.log("[FindVenues] Bulk save result:", result);

      if (!result.success) {
        throw new Error("Failed to save locations");
      }

      setSavedSceneIds(result.scene_ids);

      // Create a mapping from NEW database scene IDs back to ORIGINAL analysis scene IDs
      // This is needed because grounding uses DB IDs but our locations array has original IDs
      const dbIdToOriginalId = new Map<string, string>();
      selectedLocations.forEach((loc, index) => {
        if (result.scene_ids[index]) {
          dbIdToOriginalId.set(result.scene_ids[index], loc.scene_id);
          console.log(`[FindVenues] ID mapping: ${result.scene_ids[index]} -> ${loc.scene_id}`);
        }
      });

      // Start grounding - 5 venues per scene, processed in parallel
      console.log("[FindVenues] Starting grounding for scene_ids:", result.scene_ids);
      groundScenesWithCallback(
        result.scene_ids,
        "Los Angeles, CA",
        5,  // 5 venues per scene for better options
        true,
        (event: GroundingSSEEvent) => {
          console.log("[FindVenues] Grounding event:", event.type, event.data);
          switch (event.type) {
            case "scene_start":
              setCurrentGroundingScene(event.data.scene_header);
              break;
            case "candidate":
              // Log photo info for debugging
              const candidate = event.data.candidate;
              console.log("[FindVenues] Candidate received:", {
                venue: candidate.venue_name,
                photo_urls: candidate.photo_urls,
                photo_count: candidate.photo_urls?.length || 0,
                match_score: candidate.match_score,
              });

              // Map the DB scene_id back to the original analysis scene_id
              const originalSceneId = dbIdToOriginalId.get(event.data.scene_id) || event.data.scene_id;

              // Show venue in "considering" state briefly
              setConsideringVenue(candidate);

              // After a brief delay, move to accepted (simulates evaluation)
              setTimeout(() => {
                // Update venuesByScene (keeps last venue per scene for backwards compat)
                setVenuesByScene(prev => {
                  const next = new Map(prev);
                  next.set(originalSceneId, candidate);
                  return next;
                });

                // Prepend to allVenues list (new items at top, push others down)
                setAllVenues(prev => [candidate, ...prev]);
                setLatestVenueId(candidate.id);
                setConsideringVenue(null);
              }, 800); // Show "considering" for 800ms
              break;
            case "progress":
              setGroundingProgress({
                processed: event.data.processed,
                total: event.data.total,
                percent: event.data.percent,
              });
              break;
            case "complete":
              console.log("[FindVenues] Grounding complete!");
              setState("grounded");
              break;
            case "error":
              console.error("[FindVenues] Grounding error:", event.data.error);
              setError(event.data.error);
              break;
          }
        },
        (err: Error) => {
          console.error("[FindVenues] Stream error:", err);
          setError(err.message);
          setState("complete");
        },
        () => {
          console.log("[FindVenues] Stream closed");
        }
      );
    } catch (err) {
      console.error("[FindVenues] Caught error:", err);
      setError(err instanceof Error ? err.message : "Failed to start grounding");
      setState("complete");
    }
  };

  // Core analysis function that can be called with any script path
  const startAnalysis = useCallback((scriptPath: string) => {
    console.log("[StartAnalysis] Beginning analysis for:", scriptPath);
    setState("analyzing");
    setCurrentPhase("parsing");
    setStatus("Reading screenplay...");
    setProgress(null);
    setLocations([]);
    setError(null);
    setPageCount(null);
    setTotalLocations(null);
    setDedupeAnimation(null);
    initialLocationCountRef.current = 0;

    // Clear any pending phase transition
    if (phaseTimeoutRef.current) {
      clearTimeout(phaseTimeoutRef.current);
    }

    const cleanup = analyzeScriptWithCallback(
      scriptPath,
      (event: SSEEvent) => {
        console.log("[StartAnalysis] SSE Event received:", event.type);
        switch (event.type) {
          case "status": {
            const msg = event.data.message;
            setStatus(msg);

            // Log all status messages for debugging
            console.log("[SSE] Status:", msg, "| total:", event.data.total);

            if (msg.includes("Extracted") && msg.includes("pages")) {
              setPageCount(event.data.pages || null);
            } else if (msg.includes("deduplicating")) {
              // "Found X locations, deduplicating..." - start of dedupe
              const initialCount = event.data.total || 0;
              console.log("[SSE] Dedupe START:", initialCount);
              initialLocationCountRef.current = initialCount;
              setTotalLocations(initialCount);
              setDedupeAnimation({ before: initialCount, after: initialCount });

              // Delay the phase transition so the checkmark animation completes
              phaseTimeoutRef.current = setTimeout(() => {
                setCurrentPhase("deduplicating");
              }, 800);
            } else if (msg.includes("Merged") || msg.includes("unique")) {
              // Deduplication complete - "Merged to X unique locations" or "Found X unique locations"
              const finalCount = event.data.total || 0;
              const beforeCount = initialLocationCountRef.current || finalCount;
              console.log("[SSE] Dedupe END:", beforeCount, "->", finalCount);
              setTotalLocations(finalCount);
              // Force update animation with both values
              setDedupeAnimation({ before: beforeCount, after: finalCount });
            } else if (msg.includes("Analyzing locations")) {
              // Keep showing dedupe result for a moment before transitioning
              if (phaseTimeoutRef.current) {
                clearTimeout(phaseTimeoutRef.current);
              }
              // Delay transition to analyzing so user can see final merge count
              phaseTimeoutRef.current = setTimeout(() => {
                setCurrentPhase("analyzing");
                setTimeout(() => setDedupeAnimation(null), 300);
              }, 1500);
            }
            break;
          }
          case "location":
            setLocations((prev) => [...prev, event.data]);
            break;
          case "progress":
            setProgress(event.data);
            break;
          case "complete":
            console.log("[StartAnalysis] Analysis complete:", event.data);
            if (phaseTimeoutRef.current) {
              clearTimeout(phaseTimeoutRef.current);
            }
            setCurrentPhase("complete");
            setDedupeAnimation(null);
            setStatus(`Analyzed ${event.data.total_locations} locations in ${event.data.processing_time_seconds}s`);
            setState("complete");
            break;
          case "error":
            console.log("[StartAnalysis] Analysis error:", event.data);
            if (phaseTimeoutRef.current) {
              clearTimeout(phaseTimeoutRef.current);
            }
            setError(event.data.error);
            setState("idle");
            break;
        }
      },
      (err: Error) => {
        console.error("[StartAnalysis] Error callback:", err);
        if (phaseTimeoutRef.current) {
          clearTimeout(phaseTimeoutRef.current);
        }
        setError(err.message);
        setState("idle");
      },
      () => {
        // onComplete callback - connection closed normally
        console.log("[StartAnalysis] SSE connection closed");
      }
    );

    return cleanup;
  }, []);

  const handleFile = useCallback(async (file: File) => {
    console.log("[HandleFile] Starting upload for:", file.name);
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF file");
      return;
    }

    setError(null);
    setState("uploading");
    setStatus("Uploading screenplay...");

    try {
      const result = await uploadScript(file);
      console.log("[HandleFile] Upload result:", result);
      const script = { name: file.name, path: result.path };
      setSelectedScript(script);
      // Directly start analysis with the uploaded script
      console.log("[HandleFile] Starting analysis...");
      startAnalysis(script.path);
    } catch (err) {
      console.error("[HandleFile] Upload error:", err);
      setError(err instanceof Error ? err.message : "Upload failed");
      setState("idle");
    }
  }, [startAnalysis]);

  const handleSelectScript = useCallback((script: AvailableScript) => {
    setSelectedScript({ name: script.filename, path: script.path });
    setError(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFile(droppedFile);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Wrapper for button click - uses selectedScript
  function handleAnalyze() {
    if (!selectedScript) return;
    startAnalysis(selectedScript.path);
  }

  function handleReset() {
    if (phaseTimeoutRef.current) {
      clearTimeout(phaseTimeoutRef.current);
    }
    setSelectedScript(null);
    setStatus("");
    setCurrentPhase("parsing");
    setProgress(null);
    setLocations([]);
    setError(null);
    setState("idle");
    setPageCount(null);
    setTotalLocations(null);
    setDedupeAnimation(null);
    initialLocationCountRef.current = 0;
  }

  const currentStepIndex = ANALYSIS_STEPS.findIndex((s) => s.phase === currentPhase);

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b backdrop-blur-sm"
        style={{
          borderColor: "var(--color-border)",
          background: "rgba(247, 243, 235, 0.9)",
        }}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            {/* Film reel inspired icon */}
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ background: "var(--color-text)", color: "var(--color-bg-elevated)" }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
                <circle cx="12" cy="5" r="1" fill="currentColor" />
                <circle cx="12" cy="19" r="1" fill="currentColor" />
                <circle cx="5" cy="12" r="1" fill="currentColor" />
                <circle cx="19" cy="12" r="1" fill="currentColor" />
              </svg>
            </div>
            <div>
              <h1
                className="text-base font-semibold tracking-tight"
                style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
              >
                Location Scout
              </h1>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--color-text-subtle)" }}>
                Script Analysis
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(selectedScript || state !== "idle") && (
              <button
                onClick={handleReset}
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all hover:bg-[var(--color-bg-muted)]"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
                New Script
              </button>
            )}
            <a
              href="/grounding"
              className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all hover:bg-[var(--color-bg-muted)]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Location Discovery
            </a>
            <a
              href="/calls"
              className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all hover:bg-[var(--color-bg-muted)]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Voice Outreach
            </a>
            <a
              href="/projects"
              className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all hover:bg-[var(--color-bg-muted)]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              My Projects
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Script Selection */}
        {!selectedScript && state === "idle" && (
          <div className="animate-fade-in">
            {/* Hero */}
            <div className="mb-10 text-center">
              <h2
                className="text-3xl font-medium tracking-tight sm:text-4xl"
                style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
              >
                Breakdown Your Screenplay
              </h2>
              <p className="mx-auto mt-3 max-w-md text-base" style={{ color: "var(--color-text-muted)" }}>
                Upload a script and extract every location with AI-powered scouting notes, requirements, and mood analysis.
              </p>
            </div>

            {/* Upload Zone */}
            <div className="mx-auto max-w-xl">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className="paper-card group relative cursor-pointer rounded-lg p-10 text-center transition-all"
                style={{
                  borderColor: isDragging ? "var(--color-accent)" : undefined,
                  background: isDragging ? "var(--color-accent-light)" : undefined,
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />

                <div
                  className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full transition-transform group-hover:scale-105"
                  style={{ background: "var(--color-bg-muted)" }}
                >
                  <svg
                    className="h-6 w-6"
                    style={{ color: "var(--color-accent)" }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                </div>

                <p className="text-base font-medium" style={{ color: "var(--color-text)" }}>
                  {isDragging ? "Drop screenplay here" : "Upload Screenplay PDF"}
                </p>
                <p className="mt-1.5 text-sm" style={{ color: "var(--color-text-subtle)" }}>
                  Drag & drop or click to browse
                </p>
              </div>

              {/* Available Scripts */}
              {availableScripts.length > 0 && (
                <div className="mt-8">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="h-px flex-1" style={{ background: "var(--color-border)" }} />
                    <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>
                      Or select from library
                    </span>
                    <div className="h-px flex-1" style={{ background: "var(--color-border)" }} />
                  </div>

                  <div className="flex flex-wrap justify-center gap-3">
                    {availableScripts.map((script) => (
                      <button
                        key={script.path}
                        onClick={() => handleSelectScript(script)}
                        className="paper-card group flex items-center gap-3 rounded-md px-4 py-3 text-left transition-all hover:scale-[1.02]"
                      >
                        <div
                          className="flex h-10 w-8 items-center justify-center rounded"
                          style={{ background: "var(--color-accent-light)" }}
                        >
                          <svg className="h-5 w-5" style={{ color: "var(--color-accent)" }} viewBox="0 0 24 24" fill="none">
                            <path
                              d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path d="M14 2v6h6" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                            {script.filename.replace(".pdf", "")}
                          </p>
                          <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
                            {(script.size / 1024 / 1024).toFixed(1)} MB
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Uploading State */}
        {state === "uploading" && (
          <div className="animate-fade-in flex flex-col items-center justify-center py-20">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: "var(--color-border-strong)", borderTopColor: "transparent" }}
            />
            <p className="mt-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
              {status}
            </p>
          </div>
        )}

        {/* Script Selected - Ready to Analyze */}
        {selectedScript && state === "idle" && (
          <div className="animate-fade-in mx-auto max-w-xl">
            <div className="paper-card rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "var(--color-accent-light)" }}
                >
                  <svg className="h-6 w-6" style={{ color: "var(--color-accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3
                    className="truncate text-lg font-medium"
                    style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
                  >
                    {selectedScript.name}
                  </h3>
                  <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-muted)" }}>
                    Ready for location breakdown
                  </p>
                </div>
              </div>

              <button
                onClick={handleAnalyze}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-md py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.99]"
                style={{ background: "var(--color-accent)", color: "var(--color-bg-elevated)" }}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                  />
                </svg>
                Begin Analysis
              </button>
            </div>
          </div>
        )}

        {/* Analyzing State */}
        {state === "analyzing" && (
          <div className="animate-fade-in">
            {/* Progress Panel */}
            <div className="paper-card mx-auto mb-8 max-w-2xl overflow-hidden rounded-lg">
              {/* Script Info Header */}
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--color-border-subtle)" }}>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg"
                      style={{ background: "var(--color-accent-light)" }}
                    >
                      <svg className="h-5 w-5" style={{ color: "var(--color-accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <div className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: "var(--color-accent)" }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{selectedScript?.name}</p>
                    <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
                      {pageCount ? `${pageCount} pages` : "Reading..."}{totalLocations ? ` · ${totalLocations} locations` : ""}
                    </p>
                  </div>
                </div>
                <div className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-accent)" }}>
                  Processing
                </div>
              </div>

              {/* Steps */}
              <div className="px-5 py-5">
                <div className="flex items-center justify-between">
                  {ANALYSIS_STEPS.map((step, i) => {
                    const isActive = i === currentStepIndex;
                    const isComplete = i < currentStepIndex;
                    const isPending = i > currentStepIndex;

                    return (
                      <div key={step.phase} className="flex flex-1 items-center">
                        <div className="flex flex-col items-center">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all ${isActive ? "ring-4 ring-[var(--color-accent-light)]" : ""} ${isComplete ? "animate-checkmark" : ""}`}
                            style={{
                              background: isComplete ? "var(--color-success)" : isActive ? "var(--color-accent)" : "var(--color-bg-muted)",
                              color: isComplete || isActive ? "var(--color-bg-elevated)" : "var(--color-text-subtle)",
                            }}
                          >
                            {isComplete ? (
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : isActive && step.phase === "deduplicating" ? (
                              /* Special merge icon for dedupe step */
                              <svg className="h-4 w-4 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                            ) : isActive ? (
                              <div className="h-2 w-2 animate-spin rounded-full border border-current border-t-transparent" />
                            ) : (
                              i + 1
                            )}
                          </div>
                          <span
                            className="mt-2 text-[11px] font-medium"
                            style={{ color: isActive ? "var(--color-text)" : isPending ? "var(--color-text-subtle)" : "var(--color-text-muted)" }}
                          >
                            {step.label}
                          </span>
                        </div>
                        {i < ANALYSIS_STEPS.length - 1 && (
                          <div
                            className="mx-2 h-px flex-1 transition-all"
                            style={{ background: isComplete ? "var(--color-success)" : "var(--color-border)" }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Current Status */}
              <div className="border-t px-5 py-3" style={{ borderColor: "var(--color-border-subtle)", background: "var(--color-bg-muted)" }}>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{status || "Initializing..."}</p>
              </div>

              {/* Location Progress Bar */}
              {progress && (
                <div className="border-t px-5 py-4" style={{ borderColor: "var(--color-border-subtle)" }}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>AI Analysis Progress</span>
                    <span className="text-xs font-semibold" style={{ color: "var(--color-accent)" }}>
                      {progress.processed}/{progress.total}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--color-bg-muted)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${progress.percent}%`, background: "var(--color-accent)" }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Dedupe Animation - shows during merge phase and briefly during transition */}
            {dedupeAnimation && (currentPhase === "deduplicating" || currentPhase === "analyzing") && (
              <div className={`animate-fade-in ${currentPhase === "analyzing" ? "opacity-50 transition-opacity duration-500" : ""}`}>
                <DedupeAnimation before={dedupeAnimation.before} after={dedupeAnimation.after} />
              </div>
            )}

            {/* Locations as they stream in */}
            {locations.length > 0 && (
              <div>
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}>
                      Locations Discovered
                    </h2>
                    <div
                      className="flex items-center gap-2 rounded-full px-3 py-1 animate-pulse"
                      style={{ background: "var(--color-accent-light)" }}
                    >
                      <div className="h-2 w-2 rounded-full animate-ping" style={{ background: "var(--color-accent)" }} />
                      <span className="text-sm font-bold tabular-nums" style={{ color: "var(--color-accent)" }}>
                        {locations.length}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
                    New locations appear as they&apos;re analyzed
                  </p>
                </div>
                <LocationGrid locations={locations} isAnimated />
              </div>
            )}

            {/* Waiting for parsing to complete */}
            {currentPhase === "parsing" && (
              <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-3 w-3 rounded-full animate-bounce" style={{ background: "var(--color-accent)", animationDelay: "0ms" }} />
                  <div className="h-3 w-3 rounded-full animate-bounce" style={{ background: "var(--color-accent)", animationDelay: "150ms" }} />
                  <div className="h-3 w-3 rounded-full animate-bounce" style={{ background: "var(--color-accent)", animationDelay: "300ms" }} />
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
                  Reading screenplay and identifying scenes...
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-subtle)" }}>
                  This usually takes just a moment
                </p>
              </div>
            )}

            {/* Waiting for first location during analyze phase */}
            {locations.length === 0 && currentPhase === "analyzing" && (
              <div className="flex flex-col items-center justify-center py-12 animate-pulse">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-3 w-3 rounded-full animate-bounce" style={{ background: "var(--color-accent)", animationDelay: "0ms" }} />
                  <div className="h-3 w-3 rounded-full animate-bounce" style={{ background: "var(--color-accent)", animationDelay: "150ms" }} />
                  <div className="h-3 w-3 rounded-full animate-bounce" style={{ background: "var(--color-accent)", animationDelay: "300ms" }} />
                </div>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  Analyzing scenes with AI...
                </p>
              </div>
            )}
          </div>
        )}

        {/* Complete State - Selection Mode */}
        {state === "complete" && (
          <div className="animate-fade-in">
            {/* Header with selection controls */}
            <div className="mb-6 paper-card p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className="flex items-center gap-2 rounded-full px-3 py-1.5"
                    style={{ background: "var(--color-success-light)" }}
                  >
                    <svg className="h-3.5 w-3.5" style={{ color: "var(--color-success)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-xs font-semibold" style={{ color: "var(--color-success)" }}>Analysis Complete</span>
                  </div>
                  <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                    {selectedScript?.name}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {/* Selection controls */}
                  <button
                    onClick={handleSelectAll}
                    className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-all hover:bg-[var(--color-bg-muted)]"
                    style={{ color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedLocationIds.size === locations.length}
                      onChange={handleSelectAll}
                      className="h-3.5 w-3.5"
                      style={{ accentColor: "var(--color-accent)" }}
                    />
                    {selectedLocationIds.size === locations.length ? "Deselect All" : "Select All"}
                  </button>

                  <span className="text-sm tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                    {selectedLocationIds.size} of {locations.length} selected
                  </span>
                </div>
              </div>

              {/* Find Real Venues CTA */}
              <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "var(--color-accent-light)" }}>
                      <svg className="h-5 w-5" style={{ color: "var(--color-accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="10" r="3" />
                        <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Ready to find real locations?</p>
                      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        AI will search Google Maps for venues matching your scene requirements
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleFindRealVenues(e)}
                    disabled={selectedLocationIds.size === 0}
                    className="group flex items-center gap-2 rounded-lg px-5 py-2.5 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    style={{ background: selectedLocationIds.size > 0 ? "var(--color-accent)" : "var(--color-border)", color: "white" }}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="10" r="3" />
                      <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z" />
                    </svg>
                    <span className="text-sm font-semibold">Find Real Venues</span>
                    <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Selectable Location Grid */}
            <SelectableLocationGrid
              locations={locations}
              selectedIds={selectedLocationIds}
              onSelect={handleSelectLocation}
              onModify={(location) => {
                console.log("[Modify] TODO: Open modify dialog for scene:", location.scene_header);
                // TODO: Open a modal to modify the location requirements
              }}
            />
          </div>
        )}

        {/* Grounding State - Finding Real Venues */}
        {state === "grounding" && (
          <div className="animate-fade-in">
            {/* Progress Panel */}
            <div className="paper-card mb-6 overflow-hidden">
              <div className="p-4" style={{ background: "var(--color-accent)", color: "white" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>
                      <svg className="h-5 w-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="10" r="3" />
                        <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold">Finding Real Venues</p>
                      <p className="text-sm opacity-80">{currentGroundingScene || "Initializing search..."}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">{allVenues.length}</span>
                      <span className="text-sm opacity-80">found</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }}>
                      <div className="h-2 w-2 rounded-full animate-ping" style={{ background: "white" }} />
                      <span className="text-sm font-medium">{Math.round(groundingProgress.percent)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="p-4">
                <div className="flex justify-between text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
                  <span>Scene {groundingProgress.processed} of {groundingProgress.total}</span>
                  <span>Searching for up to 5 venues per scene</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--color-bg-muted)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-300 animate-pulse-subtle"
                    style={{ width: `${groundingProgress.percent}%`, background: "var(--color-accent)" }}
                  />
                </div>
              </div>
            </div>

            {/* Currently Evaluating Panel */}
            {consideringVenue && (
              <div
                className="paper-card mb-4 p-4 animate-fade-in"
                style={{ borderColor: "var(--color-warning)", borderWidth: "2px" }}
              >
                <div className="flex items-center gap-4">
                  {/* Spinner */}
                  <div
                    className="h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--color-warning)", opacity: 0.15 }}
                  >
                    <div
                      className="h-6 w-6 rounded-full border-2 animate-spin"
                      style={{ borderColor: "var(--color-warning)", borderTopColor: "transparent" }}
                    />
                  </div>

                  {/* Venue info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-warning)" }}>
                        Evaluating
                      </span>
                      <div className="flex gap-0.5">
                        <div className="h-1 w-1 rounded-full animate-bounce" style={{ background: "var(--color-warning)" }} />
                        <div className="h-1 w-1 rounded-full animate-bounce" style={{ background: "var(--color-warning)", animationDelay: "150ms" }} />
                        <div className="h-1 w-1 rounded-full animate-bounce" style={{ background: "var(--color-warning)", animationDelay: "300ms" }} />
                      </div>
                    </div>
                    <h4 className="font-semibold truncate" style={{ color: "var(--color-text)" }}>
                      {consideringVenue.venue_name}
                    </h4>
                    <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                      {consideringVenue.formatted_address}
                    </p>
                  </div>

                  {/* Score preview */}
                  <div className="flex flex-col items-end flex-shrink-0">
                    <span className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>
                      {Math.round(consideringVenue.match_score * 100)}%
                    </span>
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      match score
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Streaming venue grid */}
            {allVenues.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {allVenues.map((venue, index) => (
                  <VenueDiscoveryCard
                    key={venue.id}
                    venue={venue}
                    index={index}
                    isLatest={venue.id === latestVenueId}
                    onClick={() => {
                      console.log("[VenueClick]", venue.venue_name);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-3 w-3 rounded-full animate-bounce" style={{ background: "var(--color-accent)" }} />
                  <div className="h-3 w-3 rounded-full animate-bounce" style={{ background: "var(--color-accent)", animationDelay: "150ms" }} />
                  <div className="h-3 w-3 rounded-full animate-bounce" style={{ background: "var(--color-accent)", animationDelay: "300ms" }} />
                </div>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  Searching for matching venues...
                </p>
              </div>
            )}
          </div>
        )}

        {/* Grounded State - Results Complete */}
        {state === "grounded" && (
          <div className="animate-fade-in">
            {/* Success banner */}
            <div
              className="paper-card mb-6 p-5"
              style={{ background: "linear-gradient(135deg, var(--color-success-light) 0%, var(--color-bg-card) 100%)", borderColor: "var(--color-success)" }}
            >
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className="h-14 w-14 rounded-full flex items-center justify-center animate-checkmark"
                    style={{ background: "var(--color-success)", boxShadow: "0 4px 12px rgba(74, 124, 89, 0.3)" }}
                  >
                    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}>
                      Location Discovery Complete!
                    </h2>
                    <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                      Found <strong style={{ color: "var(--color-success)" }}>{allVenues.length}</strong> real venues for {locations.filter(l => selectedLocationIds.has(l.scene_id)).length} scenes
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => router.push(`/calls?project=${savedProjectId}`)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all hover:scale-[1.02]"
                  style={{ background: "var(--color-accent)", color: "white" }}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  Start Calling Venues
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>

            {/* All discovered venues */}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}>
                Discovered Venues ({allVenues.length})
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {allVenues.map((venue, index) => (
                <div
                  key={venue.id}
                  className="animate-fade-in"
                  style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
                >
                  <VenueCard
                    venue={venue}
                    isLatest={false}
                    onClick={() => {
                      console.log("[VenueClick]", venue.venue_name);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div
            className="animate-fade-in mx-auto mt-6 max-w-xl rounded-lg border p-4"
            style={{ borderColor: "var(--color-error)", background: "rgba(155, 59, 59, 0.08)" }}
          >
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-5 w-5 flex-shrink-0" style={{ color: "var(--color-error)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--color-error)" }}>Analysis Error</p>
                <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>{error}</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Pairs of similar locations that will merge
const MERGE_PAIRS = [
  { left: { header: "INT. COFFEE SHOP - DAY", type: "interior" }, right: { header: "INT. CAFÉ - MORNING", type: "interior" }, merged: { header: "INT. COFFEE SHOP / CAFÉ", type: "interior" } },
  { left: { header: "EXT. CITY STREET - NIGHT", type: "exterior" }, right: { header: "EXT. DOWNTOWN - NIGHT", type: "exterior" }, merged: { header: "EXT. URBAN STREET", type: "exterior" } },
  { left: { header: "INT. APARTMENT - DAY", type: "interior" }, right: { header: "INT. LIVING ROOM - DAY", type: "interior" }, merged: { header: "INT. APARTMENT", type: "interior" } },
];

function DedupeAnimation({ before, after }: { before: number; after: number }) {
  const [currentMergeIndex, setCurrentMergeIndex] = useState(0);
  const [mergePhase, setMergePhase] = useState<'showing' | 'merging' | 'merged'>('showing');
  const totalMerged = before - after;

  // Cycle through merge animations - faster pace
  useEffect(() => {
    const timer = setInterval(() => {
      setMergePhase(prev => {
        if (prev === 'showing') return 'merging';
        if (prev === 'merging') return 'merged';
        // Reset to next pair
        setCurrentMergeIndex(i => (i + 1) % MERGE_PAIRS.length);
        return 'showing';
      });
    }, 700); // Change phase every 0.7 seconds

    return () => clearInterval(timer);
  }, []);

  const currentPair = MERGE_PAIRS[currentMergeIndex];

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}>
            Merging Similar Locations
          </h2>
          <div
            className="flex items-center gap-2 rounded-full px-3 py-1 animate-pulse"
            style={{ background: "var(--color-accent-light)" }}
          >
            <span className="text-sm font-bold tabular-nums" style={{ color: "var(--color-accent)" }}>
              {before} → {after}
            </span>
            {totalMerged > 0 && (
              <span className="text-xs" style={{ color: "var(--color-accent)" }}>
                ({totalMerged} to merge)
              </span>
            )}
          </div>
        </div>
        <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
          Combining duplicate scene locations
        </p>
      </div>

      {/* Merge Animation Area */}
      <div className="relative flex items-center justify-center gap-6 py-12 mt-4">
        {/* Left Card */}
        <div
          className="w-72 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            transform: mergePhase === 'merging' ? 'translateX(60px) scale(0.92)' : mergePhase === 'merged' ? 'translateX(120px) scale(0)' : 'translateX(0) scale(1)',
            opacity: mergePhase === 'merged' ? 0 : 1,
          }}
        >
          <MergeCard location={currentPair.left} status={mergePhase === 'merging' ? 'merging' : 'normal'} />
        </div>

        {/* Center - Merge indicator or merged result */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          {mergePhase === 'merged' ? (
            <div className="w-80 animate-fade-in">
              <MergeCard location={currentPair.merged} status="result" />
            </div>
          ) : (
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full transition-all duration-200 ease-out"
              style={{
                background: mergePhase === 'merging' ? 'var(--color-accent)' : 'var(--color-bg-muted)',
                color: mergePhase === 'merging' ? 'white' : 'var(--color-text-muted)',
                transform: mergePhase === 'merging' ? 'scale(1.15)' : 'scale(1)',
              }}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          )}
        </div>

        {/* Right Card */}
        <div
          className="w-72 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            transform: mergePhase === 'merging' ? 'translateX(-60px) scale(0.92)' : mergePhase === 'merged' ? 'translateX(-120px) scale(0)' : 'translateX(0) scale(1)',
            opacity: mergePhase === 'merged' ? 0 : 1,
          }}
        >
          <MergeCard location={currentPair.right} status={mergePhase === 'merging' ? 'merging' : 'normal'} />
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5 mt-1">
        {MERGE_PAIRS.map((_, i) => (
          <div
            key={i}
            className="h-1.5 w-1.5 rounded-full transition-all duration-200"
            style={{
              background: i === currentMergeIndex ? 'var(--color-accent)' : 'var(--color-border)',
              transform: i === currentMergeIndex ? 'scale(1.3)' : 'scale(1)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function MergeCard({ location, status }: { location: { header: string; type: string }; status: 'normal' | 'merging' | 'result' }) {
  return (
    <div
      className="paper-card overflow-hidden rounded-lg transition-all duration-300"
      style={{
        borderColor: status === 'merging' ? 'var(--color-warning)' : status === 'result' ? 'var(--color-success)' : undefined,
        boxShadow: status === 'result' ? '0 4px 12px rgba(74, 124, 89, 0.2)' : undefined,
      }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{
          background: status === 'merging' ? 'rgba(184, 134, 11, 0.1)' : status === 'result' ? 'var(--color-success-light)' : 'var(--color-bg-muted)',
          borderBottom: '1px solid var(--color-border-subtle)'
        }}
      >
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
          <span style={{ color: location.type === 'interior' ? 'var(--color-interior)' : 'var(--color-exterior)' }}>
            {location.type === 'interior' ? (
              <svg className="h-3 w-3 inline" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
            ) : (
              <svg className="h-3 w-3 inline" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
            )}
          </span>
        </div>
        {status === 'merging' && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--color-warning)', color: 'white' }}>
            MERGING
          </span>
        )}
        {status === 'result' && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--color-success)', color: 'white' }}>
            MERGED
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        <h3 className="scene-header text-xs leading-tight" style={{ color: "var(--color-text)" }}>
          {location.header}
        </h3>

        {/* Skeleton lines */}
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 rounded" style={{ background: 'var(--color-bg-muted)', width: '85%' }} />
          <div className="h-1.5 rounded" style={{ background: 'var(--color-bg-muted)', width: '65%' }} />
        </div>

        {/* Tag */}
        <div className="mt-2">
          <div
            className="inline-block h-4 w-14 rounded"
            style={{ background: status === 'result' ? 'var(--color-success-light)' : 'var(--color-accent-light)' }}
          />
        </div>
      </div>
    </div>
  );
}

function LocationGrid({ locations, isAnimated = false }: { locations: LocationRequirement[]; isAnimated?: boolean }) {
  const [modalLocation, setModalLocation] = useState<LocationRequirement | null>(null);

  return (
    <>
      <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${isAnimated ? "" : "stagger-children"}`}>
        {locations.map((loc, index) => (
          <div
            key={loc.scene_id}
            className={isAnimated ? "animate-fade-in" : ""}
            style={isAnimated ? { animationDelay: `${Math.min(index * 50, 500)}ms` } : undefined}
          >
            <LocationCard
              location={loc}
              isNew={isAnimated && index === locations.length - 1}
              onClick={() => setModalLocation(loc)}
            />
          </div>
        ))}
      </div>

      {/* Modal for location details */}
      {modalLocation && (
        <LocationDetailModal
          location={modalLocation}
          isSelected={false}
          onSelect={() => {}}
          onClose={() => setModalLocation(null)}
        />
      )}
    </>
  );
}

function LocationCard({ location, isNew = false, onClick }: { location: LocationRequirement; isNew?: boolean; onClick?: () => void }) {
  const isInterior = location.constraints.interior_exterior === "interior";
  const isDay = location.constraints.time_of_day === "day";
  const isBoth = location.constraints.time_of_day === "both";

  return (
    <div
      className={`paper-card overflow-hidden rounded-lg transition-all cursor-pointer hover:scale-[1.02] ${isNew ? "location-new" : ""}`}
      style={{ height: "200px" }}
      onClick={onClick}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ background: "var(--color-bg-muted)", borderBottom: "1px solid var(--color-border-subtle)" }}
      >
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider">
          <span
            className="px-1.5 py-0.5 rounded truncate max-w-[70px]"
            style={{
              background: isInterior ? "rgba(107, 142, 122, 0.15)" : "rgba(154, 123, 91, 0.15)",
              color: isInterior ? "var(--color-interior)" : "var(--color-exterior)",
            }}
          >
            {location.constraints.interior_exterior}
          </span>
          <span
            className="px-1.5 py-0.5 rounded truncate max-w-[50px]"
            style={{
              background: isBoth ? "rgba(184, 134, 11, 0.15)" : isDay ? "rgba(196, 149, 10, 0.15)" : "rgba(91, 107, 170, 0.15)",
              color: isBoth ? "var(--color-warning)" : isDay ? "var(--color-day)" : "var(--color-night)",
            }}
          >
            {location.constraints.time_of_day}
          </span>
        </div>
        <span className="text-[10px] font-medium tabular-nums" style={{ color: "var(--color-text-subtle)" }}>
          pg {location.page_numbers.length > 3 ? `${location.page_numbers[0]}+` : location.page_numbers.join(", ")}
        </span>
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col" style={{ height: "156px" }}>
        <h3
          className="scene-header text-sm leading-tight line-clamp-1"
          style={{ color: "var(--color-text)" }}
        >
          {location.scene_header}
        </h3>

        <p
          className="mt-2 line-clamp-2 text-xs leading-relaxed flex-1"
          style={{ color: "var(--color-text-muted)" }}
        >
          {location.location_description || "No description"}
        </p>

        {/* Tags with ellipsis */}
        <div className="mt-auto pt-2 flex items-center gap-1.5 overflow-hidden">
          <span className="tag tag-primary truncate max-w-[80px]">{location.vibe.primary}</span>
          {location.vibe.descriptors.slice(0, 2).map((desc, i) => (
            <span key={i} className="tag tag-muted truncate max-w-[70px]">{desc}</span>
          ))}
          {location.vibe.descriptors.length > 2 && (
            <span className="text-[10px] flex-shrink-0" style={{ color: "var(--color-text-subtle)" }}>
              +{location.vibe.descriptors.length - 2}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Selectable location grid with checkboxes
function SelectableLocationGrid({
  locations,
  selectedIds,
  onSelect,
  onModify,
}: {
  locations: LocationRequirement[];
  selectedIds: Set<string>;
  onSelect: (sceneId: string, selected: boolean) => void;
  onModify: (location: LocationRequirement) => void;
}) {
  const [modalLocation, setModalLocation] = useState<LocationRequirement | null>(null);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
        {locations.map((loc) => (
          <SelectableLocationCard
            key={loc.scene_id}
            location={loc}
            isSelected={selectedIds.has(loc.scene_id)}
            onSelect={(selected) => onSelect(loc.scene_id, selected)}
            onViewDetails={() => setModalLocation(loc)}
            onModify={() => onModify(loc)}
          />
        ))}
      </div>

      {/* Location Details Modal */}
      {modalLocation && (
        <LocationDetailModal
          location={modalLocation}
          isSelected={selectedIds.has(modalLocation.scene_id)}
          onSelect={(selected) => onSelect(modalLocation.scene_id, selected)}
          onClose={() => setModalLocation(null)}
        />
      )}
    </>
  );
}

// Location card with selection checkbox - fixed height
function SelectableLocationCard({
  location,
  isSelected,
  onSelect,
  onViewDetails,
  onModify,
}: {
  location: LocationRequirement;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onViewDetails: () => void;
  onModify: () => void;
}) {
  const isInterior = location.constraints.interior_exterior === "interior";
  const isDay = location.constraints.time_of_day === "day";
  const isBoth = location.constraints.time_of_day === "both";
  const extraTags = location.vibe.descriptors.length > 2 ? location.vibe.descriptors.length - 2 : 0;

  return (
    <div
      className="paper-card overflow-hidden rounded-lg transition-all flex flex-col"
      style={{
        borderColor: isSelected ? "var(--color-accent)" : undefined,
        boxShadow: isSelected ? "0 0 0 2px var(--color-accent-light)" : undefined,
        height: "200px", // Fixed height for all cards
      }}
    >
      {/* Header bar with checkbox */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ background: isSelected ? "var(--color-accent-light)" : "var(--color-bg-muted)", borderBottom: "1px solid var(--color-border-subtle)" }}
      >
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect(e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded cursor-pointer"
            style={{ accentColor: "var(--color-accent)" }}
          />
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
            <span
              className="px-1.5 py-0.5 rounded truncate max-w-[70px]"
              style={{
                background: isInterior ? "rgba(107, 142, 122, 0.15)" : "rgba(154, 123, 91, 0.15)",
                color: isInterior ? "var(--color-interior)" : "var(--color-exterior)",
              }}
            >
              {location.constraints.interior_exterior}
            </span>
            <span
              className="px-1.5 py-0.5 rounded truncate max-w-[50px]"
              style={{
                background: isBoth ? "rgba(184, 134, 11, 0.15)" : isDay ? "rgba(196, 149, 10, 0.15)" : "rgba(91, 107, 170, 0.15)",
                color: isBoth ? "var(--color-warning)" : isDay ? "var(--color-day)" : "var(--color-night)",
              }}
            >
              {location.constraints.time_of_day}
            </span>
          </div>
        </div>
        <span className="text-[10px] font-medium tabular-nums" style={{ color: "var(--color-text-subtle)" }}>
          pg {location.page_numbers.length > 3 ? `${location.page_numbers[0]}+` : location.page_numbers.join(", ")}
        </span>
      </div>

      {/* Content - click to open modal */}
      <div
        className="p-3 flex-1 flex flex-col cursor-pointer hover:bg-[var(--color-bg-muted)] transition-colors"
        style={{ height: "156px" }}
        onClick={onViewDetails}
      >
        <h3 className="scene-header text-sm leading-tight line-clamp-1" style={{ color: "var(--color-text)" }}>
          {location.scene_header}
        </h3>
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed flex-1" style={{ color: "var(--color-text-muted)" }}>
          {location.location_description || "No description"}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-hidden flex-1">
            <span className="tag tag-primary truncate max-w-[80px]">{location.vibe.primary}</span>
            {location.vibe.descriptors.slice(0, 1).map((desc, i) => (
              <span key={i} className="tag tag-muted truncate max-w-[60px]">{desc}</span>
            ))}
            {extraTags > 1 && (
              <span className="text-[10px] flex-shrink-0" style={{ color: "var(--color-text-subtle)" }}>
                +{extraTags}
              </span>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onModify();
            }}
            className="px-2 py-1 rounded text-[10px] font-medium transition-colors flex-shrink-0"
            style={{
              background: "var(--color-bg-muted)",
              color: "var(--color-text-muted)",
              border: "1px solid var(--color-border-subtle)",
            }}
          >
            Modify
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal for location details
function LocationDetailModal({
  location,
  isSelected,
  onSelect,
  onClose,
}: {
  location: LocationRequirement;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onClose: () => void;
}) {
  const isInterior = location.constraints.interior_exterior === "interior";
  const isDay = location.constraints.time_of_day === "day";
  const isBoth = location.constraints.time_of_day === "both";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 100 }}
    >
      {/* Backdrop - subtle */}
      <div
        className="fixed inset-0"
        style={{ background: "rgba(44, 36, 22, 0.3)" }}
        onClick={onClose}
      />

      {/* Modal - compact pop-out */}
      <div
        className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl animate-scale-in"
        style={{
          background: "var(--color-bg-card)",
          boxShadow: "0 20px 40px rgba(44, 36, 22, 0.25), 0 0 0 1px var(--color-border)",
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-5 py-3"
          style={{ background: "var(--color-bg-muted)", borderBottom: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => onSelect(e.target.checked)}
              className="h-4 w-4 rounded cursor-pointer"
              style={{ accentColor: "var(--color-accent)" }}
            />
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
              <span style={{ color: isInterior ? "var(--color-interior)" : "var(--color-exterior)" }}>
                {location.constraints.interior_exterior}
              </span>
              <span style={{ color: "var(--color-border-strong)" }}>/</span>
              <span style={{ color: isBoth ? "var(--color-warning)" : isDay ? "var(--color-day)" : "var(--color-night)" }}>
                {location.constraints.time_of_day}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-elevated)] transition-colors"
          >
            <svg className="h-4 w-4" style={{ color: "var(--color-text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4" style={{ background: "var(--color-bg-card)" }}>
          {/* Title */}
          <div>
            <h2 className="scene-header text-lg" style={{ color: "var(--color-text)" }}>
              {location.scene_header}
            </h2>
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-subtle)" }}>
              Pages: {location.page_numbers.join(", ")}
            </p>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-text-subtle)" }}>
              Location Description
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              {location.location_description || "No description available"}
            </p>
          </div>

          {/* Scouting Notes */}
          {location.scouting_notes && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-text-subtle)" }}>
                Scouting Notes
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                {location.scouting_notes}
              </p>
            </div>
          )}

          {/* Vibe & Tags */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-text-subtle)" }}>
              Vibe & Style
            </h3>
            <div className="flex flex-wrap gap-1.5">
              <span className="tag tag-primary">{location.vibe.primary}</span>
              {location.vibe.secondary && <span className="tag tag-primary">{location.vibe.secondary}</span>}
              {location.vibe.descriptors.map((desc, i) => (
                <span key={i} className="tag tag-muted">{desc}</span>
              ))}
            </div>
          </div>

          {/* Requirements */}
          {location.constraints.special_requirements.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-text-subtle)" }}>
                Special Requirements
              </h3>
              <ul className="space-y-0.5">
                {location.constraints.special_requirements.map((req, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                    <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full" style={{ background: "var(--color-accent)" }} />
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Script Context */}
          {location.script_context && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-text-subtle)" }}>
                Script Context
              </h3>
              <pre
                className="overflow-x-auto whitespace-pre-wrap rounded-lg p-3 text-xs leading-relaxed max-h-32 overflow-y-auto"
                style={{
                  fontFamily: "var(--font-mono)",
                  background: "var(--color-bg-muted)",
                  color: "var(--color-text-muted)",
                  border: "1px solid var(--color-border-subtle)",
                }}
              >
                {location.script_context}
              </pre>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-3" style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
            <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
              <span>Est. {location.estimated_shoot_duration_hours}h shoot</span>
              <span style={{ color: "var(--color-success)" }}>
                {Math.round(location.vibe.confidence * 100)}% confidence
              </span>
            </div>
            <button
              onClick={() => {
                onSelect(!isSelected);
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: isSelected ? "var(--color-bg-muted)" : "var(--color-accent)",
                color: isSelected ? "var(--color-text)" : "white",
                border: isSelected ? "1px solid var(--color-border)" : "none",
              }}
            >
              {isSelected ? "Deselect" : "Select"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Scene/Venue flip grid - shows scenes that flip to reveal venues when found
function SceneVenueFlipGrid({
  locations,
  venuesByScene,
}: {
  locations: LocationRequirement[];
  venuesByScene: Map<string, LocationCandidate>;
}) {
  const [modalData, setModalData] = useState<{ location: LocationRequirement; venue: LocationCandidate | null } | null>(null);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((loc) => {
          const venue = venuesByScene.get(loc.scene_id);
          return (
            <SceneVenueFlipCard
              key={loc.scene_id}
              location={loc}
              venue={venue || null}
              onClick={() => setModalData({ location: loc, venue: venue || null })}
            />
          );
        })}
      </div>

      {/* Combined Scene/Venue Modal */}
      {modalData && (
        <SceneVenueModal
          location={modalData.location}
          venue={modalData.venue}
          onClose={() => setModalData(null)}
        />
      )}
    </>
  );
}

// Card that shows scene info while searching, transitions to venue info when found
function SceneVenueFlipCard({
  location,
  venue,
  onClick,
}: {
  location: LocationRequirement;
  venue: LocationCandidate | null;
  onClick: () => void;
}) {
  const [showVenue, setShowVenue] = useState(false);

  // Trigger transition animation when venue is discovered
  useEffect(() => {
    if (venue && !showVenue) {
      const timer = setTimeout(() => setShowVenue(true), 50);
      return () => clearTimeout(timer);
    }
  }, [venue, showVenue]);

  return (
    <div
      className="paper-card rounded-lg overflow-hidden cursor-pointer"
      style={{
        height: "220px",
        borderColor: showVenue ? "var(--color-success)" : undefined,
        transition: "border-color 0.3s ease",
        position: "relative",
      }}
      onClick={onClick}
    >
      {/* Searching state - hidden when venue found */}
      {!showVenue && (
        <div className="h-full flex flex-col p-4">
          {/* Scene header badges */}
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{
                background: location.constraints.interior_exterior === "interior" ? "rgba(107, 142, 122, 0.15)" : "rgba(154, 123, 91, 0.15)",
                color: location.constraints.interior_exterior === "interior" ? "var(--color-interior)" : "var(--color-exterior)",
              }}
            >
              {location.constraints.interior_exterior}
            </span>
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{
                background: location.constraints.time_of_day === "day" ? "rgba(196, 149, 10, 0.15)" : "rgba(91, 107, 170, 0.15)",
                color: location.constraints.time_of_day === "day" ? "var(--color-day)" : "var(--color-night)",
              }}
            >
              {location.constraints.time_of_day}
            </span>
          </div>

          {/* Scene header */}
          <h3 className="scene-header text-sm leading-tight mb-2" style={{ color: "var(--color-text)" }}>
            {location.scene_header}
          </h3>

          {/* Description with ellipsis */}
          <p
            className="text-xs leading-relaxed flex-1 overflow-hidden"
            style={{
              color: "var(--color-text-muted)",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
            }}
          >
            {location.location_description || "Analyzing scene requirements..."}
          </p>

          {/* Searching indicator */}
          <div className="mt-auto pt-3 flex items-center gap-2" style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
            <div className="flex gap-1">
              <div className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: "var(--color-accent)" }} />
              <div className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: "var(--color-accent)", animationDelay: "150ms" }} />
              <div className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: "var(--color-accent)", animationDelay: "300ms" }} />
            </div>
            <span className="text-[10px]" style={{ color: "var(--color-text-subtle)" }}>Searching...</span>
          </div>
        </div>
      )}

      {/* Venue found state */}
      {showVenue && venue && (
        <div className="h-full flex flex-col animate-fade-in">
          {/* Venue photo or gradient fallback */}
          <div
            className="relative h-24 flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, hsl(${Math.abs(venue.venue_name.charCodeAt(0) * 7) % 360}, 25%, 25%) 0%, hsl(${Math.abs(venue.venue_name.charCodeAt(0) * 7 + 40) % 360}, 30%, 18%) 100%)`,
            }}
          >
            {venue.photo_urls && venue.photo_urls.length > 0 ? (
              <img
                src={venue.photo_urls[0]}
                alt={venue.venue_name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Hide image on error, gradient shows through
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  <span className="text-white/80 text-xs font-medium tracking-wide uppercase">
                    {venue.venue_name.split(" ").slice(0, 2).map(w => w[0]).join("")}
                  </span>
                </div>
              </div>
            )}
            {/* Match score badge */}
            <div
              className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: venue.match_score >= 0.7 ? "var(--color-success)" : "var(--color-warning)", color: "white" }}
            >
              {Math.round(venue.match_score * 100)}%
            </div>
            {/* Scene reference badge */}
            <div
              className="absolute top-2 left-2 px-2 py-0.5 rounded text-[9px] font-medium"
              style={{ background: "rgba(0,0,0,0.6)", color: "white" }}
            >
              {location.scene_header.split(" ").slice(0, 3).join(" ")}
            </div>
          </div>

          {/* Venue content */}
          <div className="p-3 flex-1 flex flex-col min-h-0">
            <h3
              className="text-sm font-semibold leading-tight truncate"
              style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
              title={venue.venue_name}
            >
              {venue.venue_name}
            </h3>
            <p
              className="mt-1 text-[11px] overflow-hidden"
              style={{
                color: "var(--color-text-muted)",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
              title={venue.match_reasoning || venue.formatted_address}
            >
              {venue.match_reasoning || venue.formatted_address}
            </p>

            {/* Footer with phone, rating and Generate Alternatives */}
            <div className="mt-auto pt-2 flex flex-col gap-2" style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
              <div className="flex items-center justify-between text-[10px]">
                {venue.phone_number ? (
                  <span className="flex items-center gap-1 truncate" style={{ color: "var(--color-success)", maxWidth: "55%" }}>
                    <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                    <span className="truncate">{venue.phone_number}</span>
                  </span>
                ) : (
                  <span style={{ color: "var(--color-text-subtle)" }}>No phone</span>
                )}
                {venue.google_rating && (
                  <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
                    <svg className="h-3 w-3" fill="var(--color-warning)" viewBox="0 0 24 24">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    {venue.google_rating.toFixed(1)}
                  </span>
                )}
              </div>
              {/* Generate Alternatives button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  console.log("[GenerateAlternatives] TODO: Generate alternatives for", venue.venue_name);
                }}
                className="w-full py-1 px-2 rounded text-[10px] font-medium transition-colors"
                style={{
                  background: "var(--color-bg-muted)",
                  color: "var(--color-text-muted)",
                  border: "1px solid var(--color-border-subtle)",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "var(--color-accent-light)";
                  e.currentTarget.style.color = "var(--color-accent)";
                  e.currentTarget.style.borderColor = "var(--color-accent)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "var(--color-bg-muted)";
                  e.currentTarget.style.color = "var(--color-text-muted)";
                  e.currentTarget.style.borderColor = "var(--color-border-subtle)";
                }}
              >
                Generate Alternatives
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Combined Scene/Venue modal - shows both scene info and venue details
function SceneVenueModal({
  location,
  venue,
  onClose,
}: {
  location: LocationRequirement;
  venue: LocationCandidate | null;
  onClose: () => void;
}) {
  const [imageError, setImageError] = useState(false);
  const hasPhoto = venue && venue.photo_urls && venue.photo_urls.length > 0 && !imageError;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 100 }}
    >
      {/* Backdrop - subtle, not too dark */}
      <div
        className="fixed inset-0"
        style={{ background: "rgba(44, 36, 22, 0.3)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md rounded-xl overflow-hidden animate-scale-in"
        style={{
          background: "var(--color-bg-card)",
          boxShadow: "0 20px 40px rgba(44, 36, 22, 0.25), 0 0 0 1px var(--color-border)",
          zIndex: 1,
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full transition-colors"
          style={{ background: "rgba(0,0,0,0.4)", color: "white" }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Venue photo if available */}
        {venue && hasPhoto && (
          <div className="relative w-full h-40" style={{ background: "var(--color-bg-muted)" }}>
            <img
              src={venue.photo_urls[0]}
              alt={venue.venue_name}
              onError={() => setImageError(true)}
              className="w-full h-full object-cover"
            />
            {/* Match score */}
            <div
              className="absolute bottom-3 left-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold"
              style={{ background: venue.match_score >= 0.7 ? "var(--color-success)" : "var(--color-warning)", color: "white" }}
            >
              {Math.round(venue.match_score * 100)}% Match
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-5">
          {/* Scene info */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                style={{
                  background: location.constraints.interior_exterior === "interior" ? "rgba(107, 142, 122, 0.15)" : "rgba(154, 123, 91, 0.15)",
                  color: location.constraints.interior_exterior === "interior" ? "var(--color-interior)" : "var(--color-exterior)",
                }}
              >
                {location.constraints.interior_exterior}
              </span>
              <span
                className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                style={{
                  background: location.constraints.time_of_day === "day" ? "rgba(196, 149, 10, 0.15)" : "rgba(91, 107, 170, 0.15)",
                  color: location.constraints.time_of_day === "day" ? "var(--color-day)" : "var(--color-night)",
                }}
              >
                {location.constraints.time_of_day}
              </span>
              <span className="text-[10px]" style={{ color: "var(--color-text-subtle)" }}>
                pg {location.page_numbers.join(", ")}
              </span>
            </div>
            <h3 className="scene-header text-sm mb-1" style={{ color: "var(--color-text)" }}>
              {location.scene_header}
            </h3>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {location.location_description}
            </p>
          </div>

          {/* Divider */}
          <div className="divider my-4" />

          {/* Venue info */}
          {venue ? (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-success)" }}>
                Matched Venue
              </h4>
              <h3 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}>
                {venue.venue_name}
              </h3>
              <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                {venue.formatted_address}
              </p>

              {/* Info row */}
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                {venue.google_rating && (
                  <span className="flex items-center gap-1.5" style={{ color: "var(--color-text-secondary)" }}>
                    <svg className="h-4 w-4" fill="var(--color-warning)" viewBox="0 0 24 24">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    {venue.google_rating.toFixed(1)} ({venue.google_review_count})
                  </span>
                )}
                {venue.phone_number && (
                  <a
                    href={`tel:${venue.phone_number}`}
                    className="flex items-center gap-1.5 hover:underline"
                    style={{ color: "var(--color-success)" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                    {venue.phone_number}
                  </a>
                )}
              </div>

              {/* Match reasoning */}
              {venue.match_reasoning && (
                <p className="mt-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  {venue.match_reasoning}
                </p>
              )}

              {/* Website button */}
              {venue.website_url && (
                <a
                  href={venue.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: "var(--color-accent)", color: "white" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Visit Website
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="flex justify-center gap-1 mb-2">
                <div className="h-2 w-2 rounded-full animate-bounce" style={{ background: "var(--color-accent)" }} />
                <div className="h-2 w-2 rounded-full animate-bounce" style={{ background: "var(--color-accent)", animationDelay: "150ms" }} />
                <div className="h-2 w-2 rounded-full animate-bounce" style={{ background: "var(--color-accent)", animationDelay: "300ms" }} />
              </div>
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Searching for matching venue...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Venue grid for discovered real locations (kept for backward compatibility)
function VenueGrid({ venues }: { venues: LocationCandidate[] }) {
  const [modalVenue, setModalVenue] = useState<LocationCandidate | null>(null);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {venues.map((venue, index) => (
          <div
            key={venue.id}
            className="animate-fade-in"
            style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
          >
            <VenueCard
              venue={venue}
              isLatest={index === venues.length - 1}
              onClick={() => setModalVenue(venue)}
            />
          </div>
        ))}
      </div>

      {/* Venue Detail Modal */}
      {modalVenue && (
        <VenueDetailModal
          venue={modalVenue}
          onClose={() => setModalVenue(null)}
        />
      )}
    </>
  );
}

// Venue card showing real location with image - uniform height
function VenueCard({ venue, isLatest, onClick }: { venue: LocationCandidate; isLatest: boolean; onClick: () => void }) {
  const [imageError, setImageError] = useState(false);
  const hasPhoto = venue.photo_urls && venue.photo_urls.length > 0 && !imageError;

  return (
    <div
      className={`paper-card overflow-hidden rounded-lg transition-all cursor-pointer hover:scale-[1.02] ${isLatest ? "location-new" : ""}`}
      style={{
        borderColor: isLatest ? "var(--color-success)" : undefined,
        height: "280px", // Fixed uniform height
      }}
      onClick={onClick}
    >
      {/* Photo or placeholder */}
      <div className="relative w-full h-32 overflow-hidden" style={{ background: "var(--color-bg-muted)" }}>
        {hasPhoto ? (
          <img
            src={venue.photo_urls[0]}
            alt={venue.venue_name}
            onError={() => setImageError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="h-10 w-10" style={{ color: "var(--color-text-subtle)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </div>
        )}
        {/* Score badge */}
        <div
          className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
          style={{
            background: venue.match_score >= 0.7 ? "var(--color-success)" : "var(--color-warning)",
            color: "white",
          }}
        >
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          {Math.round(venue.match_score * 100)}%
        </div>
        {/* Latest badge */}
        {isLatest && (
          <div
            className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase"
            style={{ background: "var(--color-success)", color: "white" }}
          >
            New
          </div>
        )}
      </div>

      {/* Content - fixed height with truncation */}
      <div className="p-3 flex flex-col" style={{ height: "148px" }}>
        <h3
          className="text-sm font-semibold leading-tight line-clamp-1"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          {venue.venue_name}
        </h3>

        <p className="mt-1 text-xs leading-relaxed line-clamp-2" style={{ color: "var(--color-text-muted)" }}>
          {venue.formatted_address}
        </p>

        {/* Quick info */}
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          {venue.google_rating && (
            <span className="flex items-center gap-1" style={{ color: "var(--color-text-secondary)" }}>
              <svg className="h-3 w-3" fill="var(--color-warning)" viewBox="0 0 24 24">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {venue.google_rating.toFixed(1)}
            </span>
          )}
          {venue.phone_number && (
            <span className="flex items-center gap-1" style={{ color: "var(--color-success)" }}>
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              Phone
            </span>
          )}
        </div>

        {/* Match reasoning - truncated */}
        {venue.match_reasoning && (
          <p
            className="mt-auto pt-2 text-[10px] leading-relaxed line-clamp-2"
            style={{ color: "var(--color-text-secondary)", borderTop: "1px solid var(--color-border-subtle)" }}
          >
            {venue.match_reasoning}
          </p>
        )}
      </div>
    </div>
  );
}

// Venue discovery card - animated card that pops in during streaming
function VenueDiscoveryCard({
  venue,
  index,
  isLatest,
  onClick,
}: {
  venue: LocationCandidate;
  index: number;
  isLatest: boolean;
  onClick: () => void;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const hasPhoto = venue.photo_urls && venue.photo_urls.length > 0 && !imageError;

  // Only animate once when first rendered
  useEffect(() => {
    const timer = setTimeout(() => setHasAnimated(true), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`paper-card overflow-hidden rounded-lg cursor-pointer transition-all hover:scale-[1.02] ${!hasAnimated ? "animate-venue-pop" : ""} ${isLatest ? "animate-glow" : ""}`}
      style={{
        borderColor: isLatest ? "var(--color-accent)" : undefined,
        height: "260px",
      }}
      onClick={onClick}
    >
      {/* Image section with shimmer loading */}
      <div className="relative h-32 overflow-hidden" style={{ background: "var(--color-bg-muted)" }}>
        {hasPhoto ? (
          <>
            {/* Shimmer while loading */}
            {!imageLoaded && (
              <div className="absolute inset-0 animate-shimmer" />
            )}
            <img
              src={venue.photo_urls[0]}
              alt={venue.venue_name}
              className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="h-10 w-10" style={{ color: "var(--color-text-subtle)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </div>
        )}

        {/* Match score badge */}
        <div
          className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
          style={{
            background: venue.match_score >= 0.7 ? "var(--color-success)" : "var(--color-warning)",
            color: "white",
          }}
        >
          {Math.round(venue.match_score * 100)}%
        </div>

        {/* NEW badge for latest venue */}
        {isLatest && (
          <div className="absolute top-2 left-2">
            <div
              className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
              style={{ background: "var(--color-accent)", color: "white" }}
            >
              New
            </div>
            {/* Ping effect behind the badge */}
            <div
              className="absolute inset-0 rounded animate-ping-slow"
              style={{ background: "var(--color-accent)" }}
            />
          </div>
        )}
      </div>

      {/* Venue info */}
      <div className="p-3 flex flex-col" style={{ height: "128px" }}>
        <h4
          className="text-sm font-semibold leading-tight truncate"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          title={venue.venue_name}
        >
          {venue.venue_name}
        </h4>
        <p
          className="mt-1 text-xs leading-relaxed line-clamp-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          {venue.formatted_address}
        </p>

        {/* Quick stats */}
        <div className="mt-auto pt-2 flex items-center justify-between text-[10px]" style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
          <div className="flex items-center gap-2">
            {venue.google_rating && (
              <span className="flex items-center gap-1" style={{ color: "var(--color-text-secondary)" }}>
                <svg className="h-3 w-3" fill="var(--color-warning)" viewBox="0 0 24 24">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                {venue.google_rating.toFixed(1)}
              </span>
            )}
            {venue.phone_number ? (
              <span className="flex items-center gap-1" style={{ color: "var(--color-success)" }}>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </span>
            ) : (
              <span style={{ color: "var(--color-text-subtle)" }}>No phone</span>
            )}
          </div>
          {/* Scene reference could go here */}
        </div>
      </div>
    </div>
  );
}

// Venue detail modal - compact pop-out style
function VenueDetailModal({ venue, onClose }: { venue: LocationCandidate; onClose: () => void }) {
  const [imageError, setImageError] = useState(false);
  const hasPhoto = venue.photo_urls && venue.photo_urls.length > 0 && !imageError;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 100 }}
    >
      {/* Backdrop - subtle */}
      <div
        className="fixed inset-0"
        style={{ background: "rgba(44, 36, 22, 0.3)" }}
        onClick={onClose}
      />

      {/* Modal - compact size */}
      <div
        className="relative w-full max-w-md rounded-xl overflow-hidden animate-scale-in"
        style={{
          background: "var(--color-bg-card)",
          boxShadow: "0 20px 40px rgba(44, 36, 22, 0.25), 0 0 0 1px var(--color-border)",
          zIndex: 1,
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full transition-colors"
          style={{ background: "rgba(0,0,0,0.5)", color: "white" }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Photo */}
        {hasPhoto ? (
          <div className="relative w-full h-48 overflow-hidden" style={{ background: "var(--color-bg-muted)" }}>
            <img
              src={venue.photo_urls[0]}
              alt={venue.venue_name}
              onError={() => setImageError(true)}
              className="w-full h-full object-cover"
            />
            {/* Score badge */}
            <div
              className="absolute bottom-3 left-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold"
              style={{
                background: venue.match_score >= 0.7 ? "var(--color-success)" : "var(--color-warning)",
                color: "white",
              }}
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {Math.round(venue.match_score * 100)}% Match
            </div>
          </div>
        ) : (
          <div className="w-full h-32 flex items-center justify-center" style={{ background: "var(--color-bg-muted)" }}>
            <svg className="h-12 w-12" style={{ color: "var(--color-text-subtle)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </div>
        )}

        {/* Content */}
        <div className="p-5">
          <h2
            className="text-lg font-semibold"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            {venue.venue_name}
          </h2>

          <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
            {venue.formatted_address}
          </p>

          {/* Info row */}
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            {venue.google_rating && (
              <span className="flex items-center gap-1.5" style={{ color: "var(--color-text-secondary)" }}>
                <svg className="h-4 w-4" fill="var(--color-warning)" viewBox="0 0 24 24">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                {venue.google_rating.toFixed(1)} ({venue.google_review_count} reviews)
              </span>
            )}
            {venue.phone_number && (
              <a
                href={`tel:${venue.phone_number}`}
                className="flex items-center gap-1.5 hover:underline"
                style={{ color: "var(--color-success)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                {venue.phone_number}
              </a>
            )}
          </div>

          {/* Match reasoning */}
          {venue.match_reasoning && (
            <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-subtle)" }}>
                Why this venue matches
              </h4>
              <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                {venue.match_reasoning}
              </p>
            </div>
          )}

          {/* Website link */}
          {venue.website_url && (
            <a
              href={venue.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: "var(--color-accent)",
                color: "white",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              Visit Website
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// Modal to save analyzed locations to a project (kept for potential future use)
function SaveToProjectModal({
  scriptName,
  locationCount,
  existingProjects,
  isSaving,
  onSave,
  onClose,
}: {
  scriptName: string;
  locationCount: number;
  existingProjects: Project[];
  isSaving: boolean;
  onSave: (projectId: string, isNew: boolean, projectName?: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [projectName, setProjectName] = useState(scriptName.replace(/\.pdf$/i, ""));
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "new" && projectName.trim()) {
      onSave("", true, projectName.trim());
    } else if (mode === "existing" && selectedProjectId) {
      onSave(selectedProjectId, false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(44, 36, 22, 0.5)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg mx-4 paper-card rounded-xl overflow-hidden"
        style={{ boxShadow: "0 20px 40px rgba(44, 36, 22, 0.2)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ background: "var(--color-accent)", color: "white" }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.2)" }}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="10" r="3" />
                <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold">Find Real Venues</h3>
              <p className="text-xs opacity-80">Save {locationCount} locations to project</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/20 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* Mode Toggle */}
          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => setMode("new")}
              className="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all"
              style={{
                background: mode === "new" ? "var(--color-accent-light)" : "var(--color-bg-muted)",
                color: mode === "new" ? "var(--color-accent)" : "var(--color-text-muted)",
                border: `1px solid ${mode === "new" ? "var(--color-accent)" : "var(--color-border)"}`,
              }}
            >
              New Project
            </button>
            <button
              type="button"
              onClick={() => setMode("existing")}
              className="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all"
              style={{
                background: mode === "existing" ? "var(--color-accent-light)" : "var(--color-bg-muted)",
                color: mode === "existing" ? "var(--color-accent)" : "var(--color-text-muted)",
                border: `1px solid ${mode === "existing" ? "var(--color-accent)" : "var(--color-border)"}`,
              }}
            >
              Existing Project
            </button>
          </div>

          {/* New Project Form */}
          {mode === "new" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>
                  Project Name
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Enter project name..."
                  className="w-full px-4 py-3 rounded-lg text-sm transition-all"
                  style={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                  }}
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Existing Project Selection */}
          {mode === "existing" && (
            <div className="space-y-4">
              {existingProjects.length === 0 ? (
                <div
                  className="text-center py-8 rounded-lg"
                  style={{ background: "var(--color-bg-muted)", color: "var(--color-text-muted)" }}
                >
                  <p className="text-sm">No existing projects found.</p>
                  <p className="text-xs mt-1">Create a new project instead.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {existingProjects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => setSelectedProjectId(project.id)}
                      className="w-full p-3 rounded-lg text-left transition-all"
                      style={{
                        background: selectedProjectId === project.id ? "var(--color-accent-light)" : "var(--color-bg-elevated)",
                        border: `1px solid ${selectedProjectId === project.id ? "var(--color-accent)" : "var(--color-border)"}`,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm" style={{ color: "var(--color-text)" }}>{project.name}</span>
                        {selectedProjectId === project.id && (
                          <svg className="h-4 w-4" style={{ color: "var(--color-accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                        {project.target_city} &middot; {project.status}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Info Box */}
          <div
            className="mt-6 p-4 rounded-lg"
            style={{ background: "var(--color-bg-muted)", border: "1px solid var(--color-border-subtle)" }}
          >
            <div className="flex items-start gap-3">
              <svg className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: "var(--color-accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>Next: AI Location Discovery</p>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                  We&apos;ll use Google Maps to find real venues that match your scene requirements, with AI-powered vibe matching.
                </p>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSaving || (mode === "new" && !projectName.trim()) || (mode === "existing" && !selectedProjectId)}
            className="mt-6 w-full flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: "var(--color-accent)", color: "white" }}
          >
            {isSaving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Saving...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                Save & Find Venues
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
