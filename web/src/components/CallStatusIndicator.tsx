"use client";

import type { VapiCallStatus } from "@/lib/types";

interface CallStatusIndicatorProps {
  status: VapiCallStatus;
  callDuration?: number;
  showLabel?: boolean;
  size?: "sm" | "md";
}

// Status configuration with colors and labels
const STATUS_CONFIG: Record<
  VapiCallStatus,
  { color: string; bgColor: string; label: string; pulse: boolean }
> = {
  not_initiated: {
    color: "var(--color-text-subtle)",
    bgColor: "var(--color-border-strong)",
    label: "Ready to call",
    pulse: false,
  },
  queued: {
    color: "var(--color-warning)",
    bgColor: "var(--color-warning)",
    label: "Queued",
    pulse: true,
  },
  ringing: {
    color: "var(--color-success)",
    bgColor: "var(--color-success)",
    label: "Ringing",
    pulse: true,
  },
  in_progress: {
    color: "var(--color-success)",
    bgColor: "var(--color-success)",
    label: "On call",
    pulse: true,
  },
  completed: {
    color: "var(--color-success)",
    bgColor: "var(--color-success)",
    label: "Completed",
    pulse: false,
  },
  voicemail: {
    color: "var(--color-warning)",
    bgColor: "var(--color-warning)",
    label: "Voicemail",
    pulse: false,
  },
  no_answer: {
    color: "var(--color-warning)",
    bgColor: "var(--color-warning)",
    label: "No answer",
    pulse: false,
  },
  busy: {
    color: "var(--color-warning)",
    bgColor: "var(--color-warning)",
    label: "Busy",
    pulse: false,
  },
  failed: {
    color: "var(--color-error)",
    bgColor: "var(--color-error)",
    label: "Failed",
    pulse: false,
  },
  no_phone_number: {
    color: "var(--color-text-muted)",
    bgColor: "var(--color-border)",
    label: "No phone",
    pulse: false,
  },
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function CallStatusIndicator({
  status,
  callDuration,
  showLabel = true,
  size = "md",
}: CallStatusIndicatorProps) {
  const config = STATUS_CONFIG[status];
  const dotSize = size === "sm" ? "0.375rem" : "0.5rem";
  const fontSize = size === "sm" ? "0.6875rem" : "0.75rem";

  return (
    <div
      className="call-status"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        fontSize,
        fontWeight: 500,
        color: config.color,
      }}
    >
      {/* Status dot */}
      <span
        className={config.pulse ? "call-status-dot pulse" : "call-status-dot"}
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: "50%",
          backgroundColor: config.bgColor,
          flexShrink: 0,
        }}
      />

      {/* Label */}
      {showLabel && (
        <span>
          {config.label}
          {status === "in_progress" && callDuration !== undefined && (
            <span style={{ marginLeft: "0.25rem", opacity: 0.8 }}>
              ({formatDuration(callDuration)})
            </span>
          )}
          {status === "completed" && callDuration !== undefined && callDuration > 0 && (
            <span style={{ marginLeft: "0.25rem", opacity: 0.8 }}>
              {formatDuration(callDuration)}
            </span>
          )}
        </span>
      )}

      {/* Completed checkmark */}
      {status === "completed" && (
        <svg
          width={size === "sm" ? 12 : 14}
          height={size === "sm" ? 12 : 14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );
}
