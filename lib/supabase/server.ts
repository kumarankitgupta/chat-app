import { createClient } from "@supabase/supabase-js";

function getRequiredEnv(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
) {
  const value = process.env[name];
  if (!value) {
    throw new Error("Supabase environment variables are missing.");
  }
  return value;
}

export function createServerSupabase() {
  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return createClient(supabaseUrl, supabaseKey);
}
