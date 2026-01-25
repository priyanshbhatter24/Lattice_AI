"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { uploadScript, analyzeScriptWithCallback, getAvailableScripts, type AvailableScript } from "@/lib/api";
import type { LocationRequirement, AnalysisProgress, SSEEvent } from "@/lib/types";

type AppState = "idle" | "uploading" | "analyzing" | "complete";
type AnalysisPhase = "connecting" | "extracting" | "identifying" | "deduplicating" | "analyzing" | "complete";

const ANALYSIS_STEPS = [
  { phase: "extracting", label: "Extract", sublabel: "PDF parsing" },
  { phase: "identifying", label: "Identify", sublabel: "Scene headers" },
  { phase: "deduplicating", label: "Dedupe", sublabel: "Merge similar" },
  { phase: "analyzing", label: "Analyze", sublabel: "AI processing" },
  { phase: "complete", label: "Done", sublabel: "Complete" },
] as const;

export default function Home() {
  const [state, setState] = useState<AppState>("idle");
  const [selectedScript, setSelectedScript] = useState<{ name: string; path: string } | null>(null);
  const [availableScripts, setAvailableScripts] = useState<AvailableScript[]>([]);
  const [status, setStatus] = useState("");
  const [currentPhase, setCurrentPhase] = useState<AnalysisPhase>("connecting");
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [locations, setLocations] = useState<LocationRequirement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [totalLocations, setTotalLocations] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAvailableScripts().then(setAvailableScripts).catch(console.error);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF file");
      return;
    }

    setError(null);
    setState("uploading");
    setStatus("Uploading screenplay...");

    try {
      const result = await uploadScript(file);
      setSelectedScript({ name: file.name, path: result.path });
      setStatus("Ready to analyze");
      setState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setState("idle");
    }
  }, []);

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

  function handleAnalyze() {
    if (!selectedScript) return;

    setState("analyzing");
    setCurrentPhase("connecting");
    setStatus("Connecting...");
    setProgress(null);
    setLocations([]);
    setError(null);
    setPageCount(null);
    setTotalLocations(null);

    const cleanup = analyzeScriptWithCallback(
      selectedScript.path,
      (event: SSEEvent) => {
        switch (event.type) {
          case "status": {
            const msg = event.data.message;
            setStatus(msg);

            if (msg.includes("Extracting text")) {
              setCurrentPhase("extracting");
            } else if (msg.includes("Extracted") && msg.includes("pages")) {
              setPageCount(event.data.pages || null);
            } else if (msg.includes("Identifying")) {
              setCurrentPhase("identifying");
            } else if (msg.includes("deduplicating") || (msg.includes("Found") && msg.includes("locations"))) {
              setCurrentPhase("deduplicating");
              if (event.data.total) setTotalLocations(event.data.total);
            } else if (msg.includes("Merged to") || msg.includes("unique locations")) {
              if (event.data.total) setTotalLocations(event.data.total);
            } else if (msg.includes("Analyzing locations")) {
              setCurrentPhase("analyzing");
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
            setCurrentPhase("complete");
            setStatus(`Analyzed ${event.data.total_locations} locations in ${event.data.processing_time_seconds}s`);
            setState("complete");
            break;
          case "error":
            setError(event.data.error);
            setState("idle");
            break;
        }
      },
      (err: Error) => {
        setError(err.message);
        setState("idle");
      },
      () => {
        // onComplete callback - connection closed normally
      }
    );

    return cleanup;
  }

  function handleReset() {
    setSelectedScript(null);
    setStatus("");
    setCurrentPhase("connecting");
    setProgress(null);
    setLocations([]);
    setError(null);
    setState("idle");
    setPageCount(null);
    setTotalLocations(null);
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
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all ${isActive ? "ring-4 ring-[var(--color-accent-light)]" : ""}`}
                            style={{
                              background: isComplete ? "var(--color-success)" : isActive ? "var(--color-accent)" : "var(--color-bg-muted)",
                              color: isComplete || isActive ? "var(--color-bg-elevated)" : "var(--color-text-subtle)",
                            }}
                          >
                            {isComplete ? (
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
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

            {/* Locations as they stream in */}
            {locations.length > 0 && (
              <div>
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-lg font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}>
                    Locations ({locations.length})
                  </h2>
                </div>
                <LocationGrid locations={locations} />
              </div>
            )}
          </div>
        )}

        {/* Complete State */}
        {state === "complete" && (
          <div className="animate-fade-in">
            {/* Summary Header */}
            <div className="mb-8 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}>
                  {locations.length} Locations
                </h2>
                <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {selectedScript?.name} &middot; {status}
                </p>
              </div>
              <div
                className="flex items-center gap-2 rounded-full px-3 py-1.5"
                style={{ background: "var(--color-success-light)" }}
              >
                <svg className="h-3.5 w-3.5" style={{ color: "var(--color-success)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-xs font-semibold" style={{ color: "var(--color-success)" }}>Complete</span>
              </div>
            </div>

            <LocationGrid locations={locations} />
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

function LocationGrid({ locations }: { locations: LocationRequirement[] }) {
  return (
    <div className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {locations.map((loc) => (
        <LocationCard key={loc.scene_id} location={loc} />
      ))}
    </div>
  );
}

function LocationCard({ location }: { location: LocationRequirement }) {
  const [expanded, setExpanded] = useState(false);

  const isInterior = location.constraints.interior_exterior === "interior";
  const isDay = location.constraints.time_of_day === "day";
  const isBoth = location.constraints.time_of_day === "both";

  return (
    <div className="paper-card overflow-hidden rounded-lg">
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ background: "var(--color-bg-muted)", borderBottom: "1px solid var(--color-border-subtle)" }}
      >
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
          <span className="flex items-center gap-1" style={{ color: isInterior ? "var(--color-interior)" : "var(--color-exterior)" }}>
            {isInterior ? (
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
            ) : (
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
            )}
            {location.constraints.interior_exterior}
          </span>
          <span style={{ color: "var(--color-border-strong)" }}>/</span>
          <span style={{ color: isBoth ? "var(--color-warning)" : isDay ? "var(--color-day)" : "var(--color-night)" }}>
            {location.constraints.time_of_day}
          </span>
        </div>
        <span className="text-[10px] font-medium tabular-nums" style={{ color: "var(--color-text-subtle)" }}>
          pg {location.page_numbers.length > 3 ? `${location.page_numbers[0]}+` : location.page_numbers.join(", ")}
        </span>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3
          className="scene-header text-sm leading-tight"
          style={{ color: "var(--color-text)" }}
        >
          {location.scene_header}
        </h3>

        <p
          className="mt-2 line-clamp-2 text-[13px] leading-relaxed"
          style={{ color: "var(--color-text-muted)" }}
        >
          {location.location_description}
        </p>

        {/* Tags */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="tag tag-primary">{location.vibe.primary}</span>
          {location.vibe.descriptors.slice(0, 2).map((desc, i) => (
            <span key={i} className="tag tag-muted">{desc}</span>
          ))}
        </div>

        {/* Expand button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-4 flex w-full items-center justify-between border-t pt-3 text-xs font-medium transition-colors hover:opacity-70"
          style={{ borderColor: "var(--color-border-subtle)", color: "var(--color-text-subtle)" }}
        >
          <span>{expanded ? "Hide details" : "View details"}</span>
          <svg
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Expanded details */}
        {expanded && (
          <div className="animate-fade-in mt-4 space-y-4">
            {/* Scouting Notes */}
            <div>
              <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>
                Scouting Notes
              </h4>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                {location.scouting_notes}
              </p>
            </div>

            {/* Requirements */}
            {location.constraints.special_requirements.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>
                  Requirements
                </h4>
                <ul className="space-y-1">
                  {location.constraints.special_requirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                      <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full" style={{ background: "var(--color-accent)" }} />
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Script Context */}
            <div>
              <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>
                Script Context
              </h4>
              <pre
                className="overflow-x-auto whitespace-pre-wrap rounded-md p-3 text-xs leading-relaxed"
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

            {/* Footer */}
            <div
              className="flex items-center justify-between border-t pt-3 text-[11px]"
              style={{ borderColor: "var(--color-border-subtle)", color: "var(--color-text-subtle)" }}
            >
              <span>Est. {location.estimated_shoot_duration_hours}h shoot</span>
              <span style={{ color: "var(--color-success)" }}>
                {Math.round(location.vibe.confidence * 100)}% confidence
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
