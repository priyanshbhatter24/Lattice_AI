"use client";

import { useState, useEffect } from "react";
import { listProjects, createProject } from "@/lib/api";
import type { Project, CreateProjectRequest } from "@/lib/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [formData, setFormData] = useState<CreateProjectRequest>({
    name: "",
    company_name: "",
    target_city: "Los Angeles, CA",
    crew_size: 10,
  });

  // Load projects
  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    setIsLoading(true);
    try {
      const data = await listProjects();
      setProjects(data);
    } catch (err) {
      console.error("Failed to load projects:", err);
      setError("Failed to load projects");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name.trim() || !formData.company_name.trim()) return;

    setIsCreating(true);
    try {
      const newProject = await createProject(formData);
      setProjects((prev) => [newProject, ...prev]);
      setShowCreateModal(false);
      setFormData({
        name: "",
        company_name: "",
        target_city: "Los Angeles, CA",
        crew_size: 10,
      });
    } catch (err) {
      console.error("Failed to create project:", err);
      setError("Failed to create project");
    } finally {
      setIsCreating(false);
    }
  }

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
            maxWidth: "1200px",
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
              Projects
            </h1>
            <p
              style={{
                fontSize: "0.8125rem",
                color: "var(--color-text-muted)",
              }}
            >
              Manage your film production projects
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 1rem",
                backgroundColor: "var(--color-accent)",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
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
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Project
            </button>

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
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "1.5rem",
        }}
      >
        {/* Error */}
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

        {/* Loading */}
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
            <p>Loading projects...</p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && projects.length === 0 && (
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
            <p style={{ marginBottom: "1rem" }}>No projects yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                padding: "0.625rem 1rem",
                backgroundColor: "var(--color-accent)",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Create Your First Project
            </button>
          </div>
        )}

        {/* Project grid */}
        {!isLoading && projects.length > 0 && (
          <div
            className="stagger-children"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
              gap: "1rem",
            }}
          >
            {projects.map((project, index) => (
              <div
                key={project.id}
                className="paper-card animate-fade-in"
                style={{
                  padding: "1.25rem",
                  animationDelay: `${index * 50}ms`,
                }}
              >
                {/* Project name */}
                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.125rem",
                    fontWeight: 600,
                    color: "var(--color-text)",
                    marginBottom: "0.25rem",
                  }}
                >
                  {project.name}
                </h3>

                {/* Company */}
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--color-text-secondary)",
                    marginBottom: "0.75rem",
                  }}
                >
                  {project.company_name}
                </p>

                {/* Details */}
                <div
                  style={{
                    display: "flex",
                    gap: "1rem",
                    fontSize: "0.75rem",
                    color: "var(--color-text-muted)",
                    marginBottom: "1rem",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {project.target_city || "Los Angeles"}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    {project.crew_size || 10} crew
                  </span>
                </div>

                {/* Status badge */}
                <div style={{ marginBottom: "1rem" }}>
                  <span
                    className={`tag ${
                      project.status === "active"
                        ? "tag-primary"
                        : "tag-muted"
                    }`}
                    style={{ fontSize: "0.6875rem" }}
                  >
                    {project.status || "draft"}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <a
                    href={`/calls?project=${project.id}`}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.375rem",
                      padding: "0.5rem 0.75rem",
                      backgroundColor: "var(--color-accent)",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      textDecoration: "none",
                    }}
                  >
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                    Calls
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="paper-card animate-slide-in"
            style={{
              width: "100%",
              maxWidth: "480px",
              margin: "1rem",
              padding: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1rem 1.25rem",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: "var(--color-text)",
                }}
              >
                New Project
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                  fontSize: "1.25rem",
                }}
              >
                &times;
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateProject} style={{ padding: "1.25rem" }}>
              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    color: "var(--color-text-secondary)",
                    marginBottom: "0.375rem",
                  }}
                >
                  Project Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g., Sunset Boulevard Remake"
                  required
                  style={{
                    width: "100%",
                    padding: "0.625rem 0.75rem",
                    border: "1px solid var(--color-border)",
                    borderRadius: "4px",
                    fontSize: "0.875rem",
                  }}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    color: "var(--color-text-secondary)",
                    marginBottom: "0.375rem",
                  }}
                >
                  Production Company *
                </label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, company_name: e.target.value }))
                  }
                  placeholder="e.g., Paramount Pictures"
                  required
                  style={{
                    width: "100%",
                    padding: "0.625rem 0.75rem",
                    border: "1px solid var(--color-border)",
                    borderRadius: "4px",
                    fontSize: "0.875rem",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      fontWeight: 500,
                      color: "var(--color-text-secondary)",
                      marginBottom: "0.375rem",
                    }}
                  >
                    Target City
                  </label>
                  <input
                    type="text"
                    value={formData.target_city}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, target_city: e.target.value }))
                    }
                    placeholder="Los Angeles, CA"
                    style={{
                      width: "100%",
                      padding: "0.625rem 0.75rem",
                      border: "1px solid var(--color-border)",
                      borderRadius: "4px",
                      fontSize: "0.875rem",
                    }}
                  />
                </div>

                <div style={{ width: "100px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      fontWeight: 500,
                      color: "var(--color-text-secondary)",
                      marginBottom: "0.375rem",
                    }}
                  >
                    Crew Size
                  </label>
                  <input
                    type="number"
                    value={formData.crew_size}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        crew_size: parseInt(e.target.value) || 10,
                      }))
                    }
                    min={1}
                    max={500}
                    style={{
                      width: "100%",
                      padding: "0.625rem 0.75rem",
                      border: "1px solid var(--color-border)",
                      borderRadius: "4px",
                      fontSize: "0.875rem",
                    }}
                  />
                </div>
              </div>

              {/* Submit */}
              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  marginTop: "1.5rem",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    flex: 1,
                    padding: "0.625rem 1rem",
                    backgroundColor: "transparent",
                    color: "var(--color-text-secondary)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isCreating ||
                    !formData.name.trim() ||
                    !formData.company_name.trim()
                  }
                  style={{
                    flex: 1,
                    padding: "0.625rem 1rem",
                    backgroundColor: "var(--color-accent)",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    cursor:
                      isCreating ||
                      !formData.name.trim() ||
                      !formData.company_name.trim()
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      isCreating ||
                      !formData.name.trim() ||
                      !formData.company_name.trim()
                        ? 0.6
                        : 1,
                  }}
                >
                  {isCreating ? "Creating..." : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
