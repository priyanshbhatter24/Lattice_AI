"use client";

import type { ReactNode } from "react";
import type { LocationCandidate } from "@/lib/types";
import LocationCandidateCard from "./LocationCandidateCard";

interface LocationCandidateGridProps {
  candidates: LocationCandidate[];
  selectedIds?: Set<string>;
  onSelect?: (id: string, selected: boolean) => void;
  onTriggerCall?: (id: string) => Promise<void>;
  onApprove?: (id: string) => Promise<void>;
  onReject?: (id: string, reason: string) => Promise<void>;
  onViewDetails?: (id: string) => void;
  emptyMessage?: ReactNode;
}

export default function LocationCandidateGrid({
  candidates,
  selectedIds = new Set(),
  onSelect,
  onTriggerCall,
  onApprove,
  onReject,
  onViewDetails,
  emptyMessage = "No locations found",
}: LocationCandidateGridProps) {
  if (candidates.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "3rem 2rem",
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
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <p style={{ fontSize: "0.875rem" }}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      className="stagger-children"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: "1rem",
      }}
    >
      {candidates.map((candidate, index) => (
        <div
          key={candidate.id}
          style={{
            animationDelay: `${index * 50}ms`,
          }}
        >
          <LocationCandidateCard
            candidate={candidate}
            selected={selectedIds.has(candidate.id)}
            onSelect={onSelect}
            onTriggerCall={onTriggerCall}
            onApprove={onApprove}
            onReject={onReject}
            onViewDetails={onViewDetails}
          />
        </div>
      ))}
    </div>
  );
}
