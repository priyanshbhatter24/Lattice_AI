import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * Email confirmation callback handler.
 *
 * This route handles the email confirmation link that Supabase sends
 * when a user signs up or requests a password reset.
 *
 * Query params:
 * - token_hash: The confirmation token
 * - type: The type of confirmation (signup, recovery, email_change, etc.)
 * - next: Optional redirect URL after confirmation
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/projects";

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });

    if (!error) {
      // Redirect to the appropriate page based on type
      if (type === "recovery") {
        // Password reset - redirect to reset password page
        return NextResponse.redirect(new URL("/reset-password", request.url));
      }
      // Email confirmation - redirect to projects or specified next URL
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // If verification fails, redirect to an error page or login
  const errorUrl = new URL("/login", request.url);
  errorUrl.searchParams.set("error", "Email confirmation failed. Please try again.");
  return NextResponse.redirect(errorUrl);
}
