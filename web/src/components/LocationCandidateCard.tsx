"use client";

import { useState } from "react";
import type { LocationCandidate } from "@/lib/types";
import CallStatusIndicator from "./CallStatusIndicator";

interface LocationCandidateCardProps {
  candidate: LocationCandidate;
  selected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  onTriggerCall?: (id: string) => Promise<void>;
  onApprove?: (id: string) => Promise<void>;
  onReject?: (id: string, reason: string) => Promise<void>;
  onViewDetails?: (id: string) => void;
}

export default function LocationCandidateCard({
  candidate,
  selected = false,
  onSelect,
  onTriggerCall,
  onApprove,
  onReject,
  onViewDetails,
}: LocationCandidateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [concernsExpanded, setConcernsExpanded] = useState(false);
  const [isCallingLoading, setIsCallingLoading] = useState(false);
  const [isApproveLoading, setIsApproveLoading] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const isCallable =
    candidate.vapi_call_status === "not_initiated" &&
    candidate.phone_number &&
    candidate.status === "discovered";

  const isCallInProgress =
    candidate.vapi_call_status === "queued" ||
    candidate.vapi_call_status === "ringing" ||
    candidate.vapi_call_status === "in_progress";

  const hasCallResults =
    candidate.vapi_call_status === "completed" &&
    (candidate.venue_available !== undefined || candidate.call_summary);

  const canApprove =
    candidate.vapi_call_status === "completed" &&
    candidate.status !== "approved" &&
    candidate.status !== "rejected";

  async function handleTriggerCall() {
    if (!onTriggerCall) return;
    setIsCallingLoading(true);
    try {
      await onTriggerCall(candidate.id);
    } finally {
      setIsCallingLoading(false);
    }
  }

  async function handleApprove() {
    if (!onApprove) return;
    setIsApproveLoading(true);
    try {
      await onApprove(candidate.id);
    } finally {
      setIsApproveLoading(false);
    }
  }

  async function handleReject() {
    if (!onReject || !rejectReason.trim()) return;
    try {
      await onReject(candidate.id, rejectReason.trim());
      setShowRejectInput(false);
      setRejectReason("");
    } catch (e) {
      console.error("Failed to reject:", e);
    }
  }

  return (
    <div
      className="paper-card animate-fade-in"
      style={{
        display: "flex",
        flexDirection: "column",
        borderColor: selected ? "var(--color-accent)" : undefined,
        boxShadow: selected ? "0 0 0 2px var(--color-accent-light)" : undefined,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: "var(--color-bg-muted)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {/* Checkbox for batch selection */}
          {onSelect && (
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelect(candidate.id, e.target.checked)}
              style={{ width: "1rem", height: "1rem", cursor: "pointer" }}
            />
          )}

          {/* Call status indicator */}
          <CallStatusIndicator
            status={candidate.vapi_call_status}
            callDuration={candidate.vapi_call_duration_seconds}
            size="sm"
          />
        </div>

        {/* Match score badge */}
        <span
          className="tag tag-muted"
          style={{ fontSize: "0.6875rem" }}
        >
          {Math.round(candidate.match_score * 100)}% match
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: "1rem", flex: 1 }}>
        {/* Venue name */}
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1rem",
            fontWeight: 600,
            color: "var(--color-text)",
            marginBottom: "0.5rem",
            lineHeight: 1.3,
          }}
        >
          {candidate.venue_name}
        </h3>

        {/* Address */}
        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--color-text-secondary)",
            marginBottom: "0.75rem",
          }}
        >
          {candidate.formatted_address}
        </p>

        {/* Phone & Rating */}
        <div
          style={{
            display: "flex",
            gap: "1rem",
            fontSize: "0.75rem",
            color: "var(--color-text-muted)",
            marginBottom: "0.75rem",
          }}
        >
          {candidate.phone_number && (
            <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              {candidate.phone_number}
            </span>
          )}
          {candidate.google_rating && (
            <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="var(--color-warning)" stroke="none">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {candidate.google_rating.toFixed(1)}
            </span>
          )}
        </div>

        {/* Call Results (if completed) */}
        {hasCallResults && (
          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.75rem",
              backgroundColor: candidate.venue_available
                ? "rgba(74, 124, 89, 0.08)"
                : "rgba(155, 59, 59, 0.08)",
              borderRadius: "6px",
              border: `1px solid ${
                candidate.venue_available
                  ? "rgba(74, 124, 89, 0.2)"
                  : "rgba(155, 59, 59, 0.2)"
              }`,
            }}
          >
            {/* Availability badge */}
            <div style={{ marginBottom: "0.5rem" }}>
              <span
                className={`availability-badge ${candidate.venue_available ? "available" : "unavailable"}`}
              >
                {candidate.venue_available ? "Available" : "Not Available"}
              </span>
            </div>

            {/* Price */}
            {candidate.negotiated_price && (
              <div style={{ marginBottom: "0.375rem" }}>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.125rem",
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  ${candidate.negotiated_price.toLocaleString()}
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-text-muted)",
                    marginLeft: "0.25rem",
                  }}
                >
                  /{candidate.price_unit?.replace("_", " ") || "day"}
                </span>
              </div>
            )}

            {/* Manager contact */}
            {candidate.manager_name && (
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-text-secondary)",
                }}
              >
                Contact: {candidate.manager_name}
                {candidate.manager_title && ` (${candidate.manager_title})`}
              </p>
            )}

            {/* Availability details (e.g., "Tuesday at 11:00 AM") */}
            {candidate.availability_details && candidate.availability_details !== "[]" && (
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-text-secondary)",
                  marginTop: "0.375rem",
                }}
              >
                Available: {candidate.availability_details}
              </p>
            )}

            {/* Call summary - show prominently */}
            {candidate.call_summary && (
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-text-secondary)",
                  marginTop: "0.5rem",
                  lineHeight: 1.4,
                  fontStyle: "italic",
                }}
              >
                {candidate.call_summary}
              </p>
            )}
          </div>
        )}

        {/* Red flags (collapsible) */}
        {candidate.red_flags && candidate.red_flags.length > 0 && (
          <div className="red-flags" style={{ marginTop: "0.75rem" }}>
            <button
              onClick={() => setConcernsExpanded(!concernsExpanded)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                fontSize: "0.6875rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--color-error)",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                width: "100%",
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Concerns ({candidate.red_flags.length})
              <svg
                width={10}
                height={10}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                style={{
                  marginLeft: "auto",
                  transform: concernsExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {concernsExpanded && (
              <ul
                style={{
                  margin: 0,
                  marginTop: "0.375rem",
                  paddingLeft: "1rem",
                  fontSize: "0.75rem",
                  color: "var(--color-text-secondary)",
                }}
              >
                {candidate.red_flags.map((flag, i) => (
                  <li key={i}>{flag}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Expandable details */}
        {expanded && (
          <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--color-border)" }}>
            {/* Call summary */}
            {candidate.call_summary && (
              <div style={{ marginBottom: "0.75rem" }}>
                <p
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--color-text-muted)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Call Summary
                </p>
                <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                  {candidate.call_summary}
                </p>
              </div>
            )}

            {/* Reservation method */}
            {candidate.reservation_method && (
              <div style={{ marginBottom: "0.75rem" }}>
                <p
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--color-text-muted)",
                    marginBottom: "0.25rem",
                  }}
                >
                  How to Book
                </p>
                <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
                  {candidate.reservation_method === "email" && "Email: "}
                  {candidate.reservation_method === "call" && "Call: "}
                  {candidate.reservation_method === "website" && "Website: "}
                  {candidate.reservation_details || "Contact venue directly"}
                </p>
              </div>
            )}

            {/* Manager contact details */}
            {(candidate.manager_email || candidate.manager_direct_phone) && (
              <div>
                <p
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--color-text-muted)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Contact Details
                </p>
                {candidate.manager_email && (
                  <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
                    {candidate.manager_email}
                  </p>
                )}
                {candidate.manager_direct_phone && (
                  <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
                    {candidate.manager_direct_phone}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          padding: "0.75rem 1rem",
          borderTop: "1px solid var(--color-border)",
          backgroundColor: "var(--color-bg)",
        }}
      >
        {/* Call button */}
        {isCallable && (
          <button
            onClick={handleTriggerCall}
            disabled={isCallingLoading}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.375rem",
              padding: "0.5rem 0.75rem",
              backgroundColor: "var(--color-accent)",
              color: "var(--color-bg-elevated)",
              border: "none",
              borderRadius: "4px",
              fontSize: "0.8125rem",
              fontWeight: 500,
              cursor: isCallingLoading ? "wait" : "pointer",
              opacity: isCallingLoading ? 0.7 : 1,
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            {isCallingLoading ? "Calling..." : "Call"}
          </button>
        )}

        {/* In progress indicator */}
        {isCallInProgress && (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.5rem",
              fontSize: "0.8125rem",
              color: "var(--color-success)",
            }}
          >
            <span className="animate-pulse">Call in progress...</span>
          </div>
        )}

        {/* Approve/Reject buttons */}
        {canApprove && (
          <>
            {!showRejectInput ? (
              <>
                <button
                  onClick={handleApprove}
                  disabled={isApproveLoading}
                  style={{
                    flex: 1,
                    padding: "0.5rem 0.75rem",
                    backgroundColor: "var(--color-success)",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    cursor: isApproveLoading ? "wait" : "pointer",
                  }}
                >
                  {isApproveLoading ? "..." : "Approve"}
                </button>
                <button
                  onClick={() => setShowRejectInput(true)}
                  style={{
                    flex: 1,
                    padding: "0.5rem 0.75rem",
                    backgroundColor: "transparent",
                    color: "var(--color-error)",
                    border: "1px solid var(--color-error)",
                    borderRadius: "4px",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Reject
                </button>
              </>
            ) : (
              <div style={{ flex: 1, display: "flex", gap: "0.375rem" }}>
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason..."
                  style={{
                    flex: 1,
                    padding: "0.5rem",
                    border: "1px solid var(--color-border)",
                    borderRadius: "4px",
                    fontSize: "0.8125rem",
                  }}
                />
                <button
                  onClick={handleReject}
                  disabled={!rejectReason.trim()}
                  style={{
                    padding: "0.5rem 0.75rem",
                    backgroundColor: "var(--color-error)",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "0.8125rem",
                    cursor: rejectReason.trim() ? "pointer" : "not-allowed",
                    opacity: rejectReason.trim() ? 1 : 0.5,
                  }}
                >
                  Confirm
                </button>
                <button
                  onClick={() => {
                    setShowRejectInput(false);
                    setRejectReason("");
                  }}
                  style={{
                    padding: "0.5rem",
                    backgroundColor: "transparent",
                    color: "var(--color-text-muted)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  &times;
                </button>
              </div>
            )}
          </>
        )}

        {/* Approved/Rejected status */}
        {candidate.status === "approved" && (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.375rem",
              padding: "0.5rem",
              color: "var(--color-success)",
              fontSize: "0.8125rem",
              fontWeight: 500,
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Approved
          </div>
        )}

        {candidate.status === "rejected" && (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.375rem",
              padding: "0.5rem",
              color: "var(--color-error)",
              fontSize: "0.8125rem",
              fontWeight: 500,
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Rejected
          </div>
        )}

        {/* Expand/collapse toggle */}
        {hasCallResults && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              padding: "0.5rem",
              backgroundColor: "transparent",
              color: "var(--color-text-muted)",
              border: "1px solid var(--color-border)",
              borderRadius: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              style={{
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}

        {/* View details button */}
        {onViewDetails && (
          <button
            onClick={() => onViewDetails(candidate.id)}
            style={{
              padding: "0.5rem",
              backgroundColor: "transparent",
              color: "var(--color-text-muted)",
              border: "1px solid var(--color-border)",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
