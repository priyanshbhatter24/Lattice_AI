"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const router = useRouter();

  // Check if user has a valid recovery session
  useEffect(() => {
    async function checkSession() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      // User should have a session from the recovery link
      if (session) {
        setIsValidSession(true);
      }
      setCheckingSession(false);
    }
    checkSession();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    // Validate password strength
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess(true);
        // Redirect to login after a short delay
        setTimeout(() => {
          router.push("/login");
        }, 3000);
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  // Show loading state while checking session
  if (checkingSession) {
    return (
      <main
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--color-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}
      >
        <div style={{ textAlign: "center", color: "var(--color-text-muted)" }}>
          <p>Verifying reset link...</p>
        </div>
      </main>
    );
  }

  // Show error if no valid session
  if (!isValidSession) {
    return (
      <main
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--color-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}
      >
        <div
          className="paper-card animate-fade-in"
          style={{
            width: "100%",
            maxWidth: "400px",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: "rgba(155, 59, 59, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem",
            }}
          >
            <svg
              width={32}
              height={32}
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-error)"
              strokeWidth={2}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>

          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.5rem",
              fontWeight: 600,
              color: "var(--color-text)",
              marginBottom: "0.75rem",
            }}
          >
            Invalid or Expired Link
          </h2>

          <p
            style={{
              fontSize: "0.9375rem",
              color: "var(--color-text-secondary)",
              marginBottom: "1.5rem",
              lineHeight: 1.6,
            }}
          >
            This password reset link is invalid or has expired.
            Please request a new one.
          </p>

          <Link
            href="/forgot-password"
            style={{
              display: "inline-block",
              padding: "0.75rem 1.5rem",
              backgroundColor: "var(--color-accent)",
              color: "white",
              textDecoration: "none",
              borderRadius: "6px",
              fontSize: "0.9375rem",
              fontWeight: 500,
            }}
          >
            Request New Link
          </Link>
        </div>
      </main>
    );
  }

  // Show success message
  if (success) {
    return (
      <main
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--color-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}
      >
        <div
          className="paper-card animate-fade-in"
          style={{
            width: "100%",
            maxWidth: "400px",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: "var(--color-success-light)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem",
            }}
          >
            <svg
              width={32}
              height={32}
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-success)"
              strokeWidth={2}
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.5rem",
              fontWeight: 600,
              color: "var(--color-text)",
              marginBottom: "0.75rem",
            }}
          >
            Password Updated
          </h2>

          <p
            style={{
              fontSize: "0.9375rem",
              color: "var(--color-text-secondary)",
              marginBottom: "1.5rem",
              lineHeight: 1.6,
            }}
          >
            Your password has been successfully updated.
            Redirecting to sign in...
          </p>

          <Link
            href="/login"
            style={{
              display: "inline-block",
              padding: "0.75rem 1.5rem",
              backgroundColor: "var(--color-accent)",
              color: "white",
              textDecoration: "none",
              borderRadius: "6px",
              fontSize: "0.9375rem",
              fontWeight: 500,
            }}
          >
            Sign In Now
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--color-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        className="paper-card animate-fade-in"
        style={{
          width: "100%",
          maxWidth: "400px",
          padding: "2rem",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.75rem",
              fontWeight: 600,
              color: "var(--color-text)",
              marginBottom: "0.5rem",
            }}
          >
            Set New Password
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--color-text-muted)",
            }}
          >
            Enter your new password below
          </p>
        </div>

        {/* Error message */}
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
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label
              htmlFor="password"
              style={{
                display: "block",
                fontSize: "0.75rem",
                fontWeight: 500,
                color: "var(--color-text-secondary)",
                marginBottom: "0.375rem",
              }}
            >
              New Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              autoComplete="new-password"
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid var(--color-border)",
                borderRadius: "6px",
                fontSize: "0.9375rem",
                backgroundColor: "var(--color-bg-elevated)",
              }}
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label
              htmlFor="confirmPassword"
              style={{
                display: "block",
                fontSize: "0.75rem",
                fontWeight: 500,
                color: "var(--color-text-secondary)",
                marginBottom: "0.375rem",
              }}
            >
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              required
              autoComplete="new-password"
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid var(--color-border)",
                borderRadius: "6px",
                fontSize: "0.9375rem",
                backgroundColor: "var(--color-bg-elevated)",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              backgroundColor: "var(--color-accent)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.9375rem",
              fontWeight: 500,
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </main>
  );
}
