"use client";

import { useMemo, useState } from "react";
import type { AvailabilitySlot } from "@/lib/types";

interface TimeSlotSelectorProps {
  availabilitySlots: AvailabilitySlot[];
  selectedSlot?: { date: string; time: string };
  onSelectSlot: (date: string, time: string) => void;
}

// Generate 1-hour time slots from start to end
function generateHourlySlots(startTime: string, endTime: string): string[] {
  const slots: string[] = [];
  const [startHour] = startTime.split(":").map(Number);
  const [endHour] = endTime.split(":").map(Number);

  for (let hour = startHour; hour < endHour; hour++) {
    const start = `${hour.toString().padStart(2, "0")}:00`;
    const end = `${(hour + 1).toString().padStart(2, "0")}:00`;
    slots.push(`${start}-${end}`);
  }

  return slots;
}

// Format time for display (e.g., "09:00" -> "9am")
function formatTime(time: string): string {
  const [hour] = time.split(":").map(Number);
  const period = hour >= 12 ? "pm" : "am";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}${period}`;
}

// Format time range (e.g., "09:00-10:00" -> "9am-10am")
function formatTimeRange(range: string): string {
  const [start, end] = range.split("-");
  return `${formatTime(start)}-${formatTime(end)}`;
}

export default function TimeSlotSelector({
  availabilitySlots,
  selectedSlot,
  onSelectSlot,
}: TimeSlotSelectorProps) {
  // Group slots by date
  const slotsByDate = useMemo(() => {
    const grouped = new Map<string, { dayName: string; slots: string[] }>();

    for (const slot of availabilitySlots) {
      const hourlySlots = generateHourlySlots(slot.start_time, slot.end_time);

      if (grouped.has(slot.date)) {
        const existing = grouped.get(slot.date)!;
        // Merge hourly slots, avoiding duplicates
        const allSlots = new Set([...existing.slots, ...hourlySlots]);
        grouped.set(slot.date, {
          dayName: slot.day_name,
          slots: Array.from(allSlots).sort(),
        });
      } else {
        grouped.set(slot.date, {
          dayName: slot.day_name,
          slots: hourlySlots,
        });
      }
    }

    // Sort by date
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [availabilitySlots]);

  const [expandedDate, setExpandedDate] = useState<string | null>(
    slotsByDate.length > 0 ? slotsByDate[0][0] : null
  );

  if (availabilitySlots.length === 0) {
    return (
      <div
        style={{
          padding: "1.5rem",
          textAlign: "center",
          color: "var(--color-text-muted)",
          fontSize: "0.875rem",
        }}
      >
        No availability information provided.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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
        Select a 1-hour time slot
      </p>

      {slotsByDate.map(([date, { dayName, slots }]) => (
        <div
          key={date}
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "6px",
            overflow: "hidden",
          }}
        >
          {/* Date header */}
          <button
            onClick={() => setExpandedDate(expandedDate === date ? null : date)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.75rem 1rem",
              backgroundColor: "var(--color-bg-muted)",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div>
              <span
                style={{
                  fontWeight: 600,
                  color: "var(--color-text)",
                  fontSize: "0.875rem",
                }}
              >
                {dayName}
              </span>
              <span
                style={{
                  marginLeft: "0.5rem",
                  color: "var(--color-text-muted)",
                  fontSize: "0.8125rem",
                }}
              >
                {new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                className="tag tag-muted"
                style={{ fontSize: "0.6875rem" }}
              >
                {slots.length} slots
              </span>
              <svg
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                style={{
                  transform: expandedDate === date ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                  color: "var(--color-text-muted)",
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </button>

          {/* Time slots grid */}
          {expandedDate === date && (
            <div
              className="time-slot-grid"
              style={{
                padding: "0.75rem",
                backgroundColor: "var(--color-bg-elevated)",
              }}
            >
              {slots.map((slot) => {
                const isSelected =
                  selectedSlot?.date === date && selectedSlot?.time === slot;

                return (
                  <button
                    key={slot}
                    onClick={() => onSelectSlot(date, slot)}
                    className={`time-slot ${isSelected ? "selected" : ""}`}
                  >
                    {formatTimeRange(slot)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Selected slot display */}
      {selectedSlot && (
        <div
          style={{
            marginTop: "0.5rem",
            padding: "0.75rem",
            backgroundColor: "var(--color-accent-light)",
            borderRadius: "6px",
            border: "1px solid var(--color-accent)",
          }}
        >
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--color-accent)",
              fontWeight: 500,
            }}
          >
            Selected:{" "}
            {new Date(selectedSlot.date + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}{" "}
            at {formatTimeRange(selectedSlot.time)}
          </p>
        </div>
      )}
    </div>
  );
}
