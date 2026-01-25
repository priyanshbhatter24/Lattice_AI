import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Singleton client instance
let clientInstance: SupabaseClient | null = null;

export const createClient = () => {
  // During SSR/SSG, return a no-op client or throw
  if (typeof window === "undefined") {
    // This shouldn't be called during SSR, but if it is, don't crash the build
    throw new Error("createClient should only be called in the browser");
  }

  // Return singleton if already created
  if (clientInstance) {
    return clientInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
    );
  }

  clientInstance = createBrowserClient(supabaseUrl, supabaseKey);
  return clientInstance;
};
