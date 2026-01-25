"use client";

import { useState } from "react";
import { analyzeScript } from "@/lib/api";
import type { LocationRequirement, AnalysisProgress } from "@/lib/types";

export default function Home() {
  const [filePath, setFilePath] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [locations, setLocations] = useState<LocationRequirement[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    if (!filePath.trim()) return;

    setIsAnalyzing(true);
    setStatus("");
    setProgress(null);
    setLocations([]);
    setError(null);

    try {
      for await (const event of analyzeScript(filePath)) {
        switch (event.type) {
          case "status":
            setStatus(event.data.message);
            break;
          case "location":
            setLocations((prev) => [...prev, event.data]);
            break;
          case "progress":
            setProgress(event.data);
            break;
          case "complete":
            setStatus(
              `Complete! Analyzed ${event.data.total_locations} locations in ${event.data.processing_time_seconds}s`
            );
            break;
          case "error":
            setError(event.data.error);
            break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight">Location Scout</h1>
          <p className="mt-2 text-zinc-400">
            AI-powered location analysis for film production
          </p>
        </header>

        <div className="mb-8 flex gap-4">
          <input
            type="text"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            placeholder="Path to screenplay PDF..."
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:border-zinc-700 focus:outline-none"
            disabled={isAnalyzing}
          />
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !filePath.trim()}
            className="rounded-lg bg-zinc-100 px-6 py-3 font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAnalyzing ? "Analyzing..." : "Analyze"}
          </button>
        </div>

        {(status || progress) && (
          <div className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-sm text-zinc-300">{status}</p>
            {progress && (
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full bg-zinc-100 transition-all duration-300"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {progress.processed} / {progress.total} locations
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mb-8 rounded-lg border border-red-900 bg-red-950 p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {locations.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">
              Locations ({locations.length})
            </h2>
            <div className="grid gap-4">
              {locations.map((loc) => (
                <LocationCard key={loc.scene_id} location={loc} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LocationCard({ location }: { location: LocationRequirement }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium">{location.scene_header}</h3>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-zinc-800 px-2 py-1">
              {location.constraints.interior_exterior}
            </span>
            <span className="rounded bg-zinc-800 px-2 py-1">
              {location.constraints.time_of_day}
            </span>
            <span className="rounded bg-zinc-800 px-2 py-1">
              Pages: {location.page_numbers.join(", ")}
            </span>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-zinc-400 hover:text-zinc-300"
        >
          {expanded ? "Less" : "More"}
        </button>
      </div>

      <div className="mt-3">
        <p className="text-sm text-zinc-400">{location.location_description}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {location.vibe.descriptors.map((desc, i) => (
          <span
            key={i}
            className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
          >
            {desc}
          </span>
        ))}
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Vibe
            </h4>
            <p className="mt-1 text-sm">
              {location.vibe.primary}
              {location.vibe.secondary && ` / ${location.vibe.secondary}`}
              <span className="ml-2 text-zinc-500">
                ({Math.round(location.vibe.confidence * 100)}% confidence)
              </span>
            </p>
          </div>

          <div>
            <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Scouting Notes
            </h4>
            <p className="mt-1 text-sm text-zinc-300">
              {location.scouting_notes}
            </p>
          </div>

          {location.constraints.special_requirements.length > 0 && (
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Special Requirements
              </h4>
              <ul className="mt-1 list-inside list-disc text-sm text-zinc-300">
                {location.constraints.special_requirements.map((req, i) => (
                  <li key={i}>{req}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Script Context
            </h4>
            <p className="mt-1 whitespace-pre-wrap font-mono text-xs text-zinc-400">
              {location.script_context}
            </p>
          </div>

          <div className="text-xs text-zinc-500">
            Est. shoot duration: {location.estimated_shoot_duration_hours}h
          </div>
        </div>
      )}
    </div>
  );
}
