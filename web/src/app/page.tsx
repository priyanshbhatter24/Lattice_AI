"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { uploadScript, analyzeScriptWithCallback, getAvailableScripts, type AvailableScript } from "@/lib/api";
import type { LocationRequirement, AnalysisProgress, SSEEvent } from "@/lib/types";

type AppState = "idle" | "uploading" | "analyzing" | "complete";
type AnalysisPhase = "connecting" | "extracting" | "identifying" | "deduplicating" | "analyzing" | "complete";

const ANALYSIS_STEPS = [
  { phase: "extracting", label: "Extract PDF" },
  { phase: "identifying", label: "Find Locations" },
  { phase: "deduplicating", label: "Deduplicate" },
  { phase: "analyzing", label: "AI Analysis" },
  { phase: "complete", label: "Complete" },
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

    // Store cleanup function for potential cancellation
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
      <header className="border-b px-6 py-5" style={{ borderColor: "var(--color-border-subtle)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--color-accent)" }}>
              <svg className="h-5 w-5" style={{ color: "var(--color-bg)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}>
              Location Scout
            </h1>
          </div>
          {(selectedScript || state !== "idle") && (
            <button onClick={handleReset} className="text-sm transition-colors hover:opacity-80" style={{ color: "var(--color-text-muted)" }}>
              Start Over
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-12">
        {/* Script Selection */}
        {!selectedScript && state === "idle" && (
          <div className="animate-fade-in mx-auto max-w-2xl">
            <div className="mb-8 text-center">
              <h2 className="text-4xl font-medium tracking-tight" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}>
                Analyze Your Screenplay
              </h2>
              <p className="mt-3 text-lg" style={{ color: "var(--color-text-muted)" }}>
                Upload a PDF and we&apos;ll extract every location with AI-powered scouting notes
              </p>
            </div>

            {/* Upload Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className="group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed p-16 text-center transition-all duration-300"
              style={{
                borderColor: isDragging ? "var(--color-accent)" : "var(--color-border)",
                background: isDragging ? "var(--color-accent-muted)" : "var(--color-bg-elevated)",
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
                className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110"
                style={{ background: "var(--color-bg-muted)" }}
              >
                <svg className="h-8 w-8" style={{ color: "var(--color-accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>

              <p className="text-lg font-medium" style={{ color: "var(--color-text)" }}>
                {isDragging ? "Drop your screenplay" : "Drop screenplay PDF here"}
              </p>
              <p className="mt-2 text-sm" style={{ color: "var(--color-text-subtle)" }}>
                or click to browse
              </p>

              {/* Decorative corners */}
              <div className="absolute left-4 top-4 h-8 w-8 border-l-2 border-t-2 opacity-30" style={{ borderColor: "var(--color-accent)" }} />
              <div className="absolute right-4 top-4 h-8 w-8 border-r-2 border-t-2 opacity-30" style={{ borderColor: "var(--color-accent)" }} />
              <div className="absolute bottom-4 left-4 h-8 w-8 border-b-2 border-l-2 opacity-30" style={{ borderColor: "var(--color-accent)" }} />
              <div className="absolute bottom-4 right-4 h-8 w-8 border-b-2 border-r-2 opacity-30" style={{ borderColor: "var(--color-accent)" }} />
            </div>

            {/* Available Scripts Carousel */}
            {availableScripts.length > 0 && (
              <div className="mt-10">
                <p className="mb-4 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>
                  or choose from library
                </p>
                <div className="flex justify-center gap-4 overflow-x-auto pb-2">
                  {availableScripts.map((script) => (
                    <button
                      key={script.path}
                      onClick={() => handleSelectScript(script)}
                      className="group flex flex-col items-center gap-3 rounded-xl p-4 transition-all duration-200 hover:scale-105"
                      style={{ background: "var(--color-bg-elevated)" }}
                    >
                      <div
                        className="relative flex h-20 w-16 items-center justify-center rounded-lg transition-all duration-200 group-hover:shadow-lg"
                        style={{ background: "var(--color-bg-muted)" }}
                      >
                        {/* PDF Icon */}
                        <svg className="h-10 w-10" style={{ color: "var(--color-accent)" }} fill="currentColor" viewBox="0 0 24 24">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M14 2v6h6" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M9 15h.01M12 15h.01M15 15h.01M9 18h.01M12 18h.01" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                        </svg>
                        {/* PDF label */}
                        <div
                          className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}
                        >
                          PDF
                        </div>
                      </div>
                      <div className="max-w-[120px] text-center">
                        <p
                          className="truncate text-xs font-medium"
                          style={{ color: "var(--color-text)" }}
                          title={script.filename}
                        >
                          {script.filename.replace(".pdf", "")}
                        </p>
                        <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-text-subtle)" }}>
                          {(script.size / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Uploading State */}
        {state === "uploading" && (
          <div className="animate-fade-in mx-auto max-w-2xl text-center">
            <div className="flex items-center justify-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }} />
              <p style={{ color: "var(--color-text-muted)" }}>{status}</p>
            </div>
          </div>
        )}

        {/* Script Selected - Ready to Analyze */}
        {selectedScript && state === "idle" && (
          <div className="animate-fade-in mx-auto max-w-2xl">
            <div className="mb-8 rounded-2xl border p-6" style={{ borderColor: "var(--color-border-subtle)", background: "var(--color-bg-elevated)" }}>
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl" style={{ background: "var(--color-bg-muted)" }}>
                  <svg className="h-7 w-7" style={{ color: "var(--color-accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}>
                    {selectedScript.name}
                  </h3>
                  <p className="mt-1 text-sm" style={{ color: "var(--color-text-subtle)" }}>
                    Ready to analyze
                  </p>
                </div>
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={handleAnalyze}
                className="inline-flex items-center gap-3 rounded-xl px-8 py-4 text-lg font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                </svg>
                Analyze Locations
              </button>
            </div>
          </div>
        )}

        {/* Analyzing State */}
        {state === "analyzing" && (
          <div className="animate-fade-in">
            {/* Progress Panel */}
            <div className="mx-auto mb-8 max-w-3xl overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-border-subtle)", background: "var(--color-bg-elevated)" }}>
              {/* Animated header bar */}
              <div className="relative h-1 overflow-hidden" style={{ background: "var(--color-bg-muted)" }}>
                <div
                  className="absolute inset-y-0 left-0 w-1/3"
                  style={{
                    background: `linear-gradient(90deg, transparent, var(--color-accent), transparent)`,
                    animation: "shimmer 1.5s infinite",
                  }}
                />
              </div>

              <div className="p-6">
                {/* Script name */}
                <div className="mb-6 flex items-center gap-3">
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: "var(--color-bg-muted)" }}>
                    <svg className="h-6 w-6" style={{ color: "var(--color-accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <div className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full" style={{ background: "var(--color-accent)" }} />
                  </div>
                  <div>
                    <p className="text-lg font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}>{selectedScript?.name}</p>
                    <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                      {pageCount ? `${pageCount} pages extracted` : "Reading PDF..."}
                      {totalLocations ? ` · ${totalLocations} locations found` : ""}
                    </p>
                  </div>
                </div>

                {/* Steps */}
                <div className="mb-6 rounded-xl p-4" style={{ background: "var(--color-bg-muted)" }}>
                  <div className="flex items-center justify-between">
                    {ANALYSIS_STEPS.map((step, i) => {
                      const isActive = i === currentStepIndex;
                      const isComplete = i < currentStepIndex;
                      const isPending = i > currentStepIndex;

                      return (
                        <div key={step.phase} className="flex flex-1 items-center">
                          <div className="flex flex-col items-center">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-all duration-300 ${isActive ? "scale-110 shadow-lg" : ""}`}
                              style={{
                                background: isComplete ? "var(--color-success)" : isActive ? "var(--color-accent)" : "var(--color-bg-elevated)",
                                color: isComplete || isActive ? "var(--color-bg)" : "var(--color-text-subtle)",
                                boxShadow: isActive ? "0 0 20px var(--color-accent)" : "none",
                              }}
                            >
                              {isComplete ? (
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              ) : isActive ? (
                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              ) : (
                                i + 1
                              )}
                            </div>
                            <span
                              className="mt-2 text-xs font-medium whitespace-nowrap"
                              style={{ color: isActive ? "var(--color-text)" : isPending ? "var(--color-text-subtle)" : "var(--color-text-muted)" }}
                            >
                              {step.label}
                            </span>
                          </div>
                          {i < ANALYSIS_STEPS.length - 1 && (
                            <div
                              className="mx-1 h-0.5 flex-1 rounded-full transition-all duration-500"
                              style={{ background: isComplete ? "var(--color-success)" : "var(--color-border)" }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Current Status */}
                <div className="flex items-center gap-3 rounded-lg px-4 py-3" style={{ background: "var(--color-bg)" }}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "var(--color-accent-muted)" }}>
                    <div className="h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--color-accent)" }} />
                  </div>
                  <p className="flex-1 text-sm font-medium" style={{ color: "var(--color-text)" }}>{status || "Initializing..."}</p>
                </div>

                {/* Location Progress */}
                {progress && (
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-sm" style={{ color: "var(--color-text-muted)" }}>
                      <span>Analyzing locations with AI</span>
                      <span className="font-medium" style={{ color: "var(--color-accent)" }}>{progress.processed} / {progress.total}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full" style={{ background: "var(--color-bg)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${progress.percent}%`, background: "linear-gradient(90deg, var(--color-accent-muted), var(--color-accent))" }}
                      />
                    </div>
                    <p className="mt-2 text-xs" style={{ color: "var(--color-text-subtle)" }}>
                      {Math.round(progress.percent)}% complete
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Locations as they stream in */}
            {locations.length > 0 && (
              <div>
                <h2 className="mb-4 text-lg font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}>
                  Locations Found ({locations.length})
                </h2>
                <LocationGrid locations={locations} />
              </div>
            )}
          </div>
        )}

        {/* Complete State */}
        {state === "complete" && (
          <div className="animate-fade-in">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}>
                  {locations.length} Locations Analyzed
                </h2>
                <p className="mt-1 text-sm" style={{ color: "var(--color-text-subtle)" }}>
                  {selectedScript?.name} · {status}
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full px-4 py-2" style={{ background: "rgba(34, 197, 94, 0.1)" }}>
                <svg className="h-4 w-4" style={{ color: "var(--color-success)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium" style={{ color: "var(--color-success)" }}>Complete</span>
              </div>
            </div>

            <LocationGrid locations={locations} />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="animate-fade-in mx-auto mt-6 max-w-2xl rounded-xl border p-4" style={{ borderColor: "var(--color-error)", background: "rgba(239, 68, 68, 0.1)" }}>
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-5 w-5 flex-shrink-0" style={{ color: "var(--color-error)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <div>
                <p className="font-medium" style={{ color: "var(--color-error)" }}>Analysis Error</p>
                <p className="mt-1 text-sm" style={{ color: "var(--color-error)" }}>{error}</p>
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
    <div className="stagger-children grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

  return (
    <div
      className="group overflow-hidden rounded-xl border transition-all duration-300"
      style={{ borderColor: "var(--color-border-subtle)", background: "var(--color-bg-elevated)" }}
    >
      <div className="flex items-center justify-between px-4 py-2.5 text-xs font-medium uppercase tracking-wider" style={{ background: "var(--color-bg-muted)", color: "var(--color-text-subtle)" }}>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1" style={{ color: isInterior ? "var(--color-accent)" : "var(--color-text-muted)" }}>
            {isInterior ? (
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" />
              </svg>
            )}
            {location.constraints.interior_exterior}
          </span>
          <span style={{ color: "var(--color-border)" }}>·</span>
          <span style={{ color: isDay ? "#fbbf24" : "#818cf8" }}>{location.constraints.time_of_day}</span>
        </div>
        <span>pg {location.page_numbers.join(", ")}</span>
      </div>

      <div className="p-4">
        <h3 className="font-medium leading-snug" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)", fontSize: "1.05rem" }}>
          {location.scene_header}
        </h3>

        <p className="mt-2 line-clamp-2 text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
          {location.location_description}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-md px-2 py-0.5 text-xs font-medium" style={{ background: "var(--color-accent-muted)", color: "var(--color-accent)" }}>
            {location.vibe.primary}
          </span>
          {location.vibe.descriptors.slice(0, 2).map((desc, i) => (
            <span key={i} className="rounded-md px-2 py-0.5 text-xs" style={{ background: "var(--color-bg-muted)", color: "var(--color-text-subtle)" }}>
              {desc}
            </span>
          ))}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex w-full items-center justify-between py-2 text-xs font-medium transition-colors"
          style={{ color: "var(--color-text-subtle)" }}
        >
          <span>{expanded ? "Less details" : "View details"}</span>
          <svg className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expanded && (
          <div className="animate-fade-in mt-3 space-y-4 border-t pt-4" style={{ borderColor: "var(--color-border-subtle)" }}>
            <div>
              <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>Scouting Notes</h4>
              <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>{location.scouting_notes}</p>
            </div>

            {location.constraints.special_requirements.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>Requirements</h4>
                <ul className="space-y-1">
                  {location.constraints.special_requirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
                      <span style={{ color: "var(--color-accent)" }}>•</span>
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>Script Context</h4>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg p-3 text-xs leading-relaxed" style={{ fontFamily: "var(--font-mono)", background: "var(--color-bg)", color: "var(--color-text-subtle)" }}>
                {location.script_context}
              </pre>
            </div>

            <div className="flex items-center justify-between border-t pt-3 text-xs" style={{ borderColor: "var(--color-border-subtle)", color: "var(--color-text-subtle)" }}>
              <span>Est. {location.estimated_shoot_duration_hours}h shoot</span>
              <span className="flex items-center gap-1" style={{ color: "var(--color-success)" }}>
                {Math.round(location.vibe.confidence * 100)}% confidence
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
