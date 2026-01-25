"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getProject, listProjectScenes, listLocations } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Project, Scene, LocationCandidate } from "@/lib/types";

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { user, loading: authLoading } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [locations, setLocations] = useState<LocationCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    async function loadData() {
      setIsLoading(true);
      try {
        const [projectData, scenesData, locationsData] = await Promise.all([
          getProject(projectId),
          listProjectScenes(projectId).catch(() => []),
          listLocations({ projectId }).catch(() => []),
        ]);
        setProject(projectData);
        setScenes(scenesData);
        setLocations(locationsData);
      } catch (err) {
        console.error("Failed to load project:", err);
        setError("Failed to load project");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [projectId, authLoading, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
          <div className="animate-spin" style={{ display: "inline-block" }}>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth={2}>
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "1rem" }}>
          <p style={{ color: "var(--color-error)" }}>{error || "Project not found"}</p>
          <button onClick={() => router.push("/projects")} className="rounded-md px-4 py-2 text-sm font-medium" style={{ background: "var(--color-accent)", color: "white" }}>
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  const hasScript = !!project.script_path;
  const hasScenes = scenes.length > 0;
  const hasLocations = locations.length > 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b backdrop-blur-sm"
        style={{ borderColor: "var(--color-border)", background: "rgba(247, 243, 235, 0.9)" }}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/projects")}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-all hover:bg-[var(--color-bg-muted)]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Projects
            </button>
            <div className="h-6 w-px" style={{ background: "var(--color-border)" }} />
            <div>
              <h1 className="text-base font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}>
                {project.name}
              </h1>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--color-text-subtle)" }}>
                {project.company_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="tag tag-muted">{project.target_city}</span>
            <span className={`tag ${project.status === "active" ? "tag-primary" : "tag-muted"}`}>{project.status}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Stats Row */}
        <div className="mb-8 grid grid-cols-4 gap-4">
          <div className="paper-card rounded-lg p-4">
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>Script</p>
            <p className="mt-1 text-2xl font-semibold" style={{ color: hasScript ? "var(--color-success)" : "var(--color-text-subtle)" }}>
              {hasScript ? "Uploaded" : "—"}
            </p>
          </div>
          <div className="paper-card rounded-lg p-4">
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>Scenes</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: hasScenes ? "var(--color-text)" : "var(--color-text-subtle)" }}>
              {scenes.length}
            </p>
          </div>
          <div className="paper-card rounded-lg p-4">
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>Locations</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: hasLocations ? "var(--color-text)" : "var(--color-text-subtle)" }}>
              {locations.length}
            </p>
          </div>
          <div className="paper-card rounded-lg p-4">
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>Calls Made</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: "var(--color-text-subtle)" }}>
              {locations.filter((l) => l.vapi_call_status !== "not_initiated").length}
            </p>
          </div>
        </div>

        {/* Workflow Actions */}
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}>
            Workflow
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {/* Script Analysis */}
            <a
              href={`/analyze?project=${projectId}`}
              className="paper-card group flex flex-col rounded-lg p-5 transition-all hover:scale-[1.02]"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--color-accent-light)" }}>
                <svg className="h-6 w-6" style={{ color: "var(--color-accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Script Analysis</h3>
              <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                {hasScenes ? `${scenes.length} scenes extracted` : "Upload and analyze your screenplay"}
              </p>
              <div className="mt-auto pt-3">
                <span className="inline-flex items-center gap-1 text-xs font-medium transition-colors group-hover:gap-2" style={{ color: "var(--color-accent)" }}>
                  {hasScenes ? "Re-analyze" : "Start"}
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              </div>
            </a>

            {/* Location Discovery */}
            <a
              href={hasScenes ? `/grounding?project=${projectId}` : "#"}
              className={`paper-card group flex flex-col rounded-lg p-5 transition-all ${hasScenes ? "hover:scale-[1.02]" : "opacity-50 cursor-not-allowed"}`}
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: hasScenes ? "var(--color-accent-light)" : "var(--color-bg-muted)" }}>
                <svg className="h-6 w-6" style={{ color: hasScenes ? "var(--color-accent)" : "var(--color-text-subtle)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <circle cx="12" cy="10" r="3" />
                  <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Location Discovery</h3>
              <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                {hasLocations ? `${locations.length} venues found` : hasScenes ? "Find real filming locations" : "Analyze script first"}
              </p>
              <div className="mt-auto pt-3">
                {hasScenes && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium transition-colors group-hover:gap-2" style={{ color: "var(--color-accent)" }}>
                    {hasLocations ? "View locations" : "Discover"}
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                )}
              </div>
            </a>

            {/* Voice Outreach */}
            <a
              href={hasLocations ? `/calls?project=${projectId}` : "#"}
              className={`paper-card group flex flex-col rounded-lg p-5 transition-all ${hasLocations ? "hover:scale-[1.02]" : "opacity-50 cursor-not-allowed"}`}
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: hasLocations ? "var(--color-accent-light)" : "var(--color-bg-muted)" }}>
                <svg className="h-6 w-6" style={{ color: hasLocations ? "var(--color-accent)" : "var(--color-text-subtle)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Voice Outreach</h3>
              <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                {hasLocations ? "Call venues for availability" : "Discover locations first"}
              </p>
              <div className="mt-auto pt-3">
                {hasLocations && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium transition-colors group-hover:gap-2" style={{ color: "var(--color-accent)" }}>
                    Start calling
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                )}
              </div>
            </a>
          </div>
        </div>

        {/* Scenes List */}
        {hasScenes && (
          <div>
            <h2 className="mb-4 text-lg font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}>
              Scenes ({scenes.length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {scenes.slice(0, 9).map((scene) => {
                const sceneLocations = locations.filter((l) => l.scene_id === scene.id);
                return (
                  <div key={scene.id} className="paper-card rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2" style={{ background: "var(--color-bg-muted)", borderBottom: "1px solid var(--color-border-subtle)" }}>
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>
                        pg {scene.page_numbers?.join(", ") || "?"}
                      </span>
                      {sceneLocations.length > 0 && (
                        <span className="text-[10px] font-medium" style={{ color: "var(--color-success)" }}>
                          {sceneLocations.length} venues
                        </span>
                      )}
                    </div>
                    <div className="p-4">
                      <p className="scene-header text-sm" style={{ color: "var(--color-text)" }}>{scene.scene_header}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {scenes.length > 9 && (
              <p className="mt-4 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                +{scenes.length - 9} more scenes
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
