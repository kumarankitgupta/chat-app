import { createServerSupabase } from "@/lib/supabase/server";

type ServiceStateRow = {
  suspended_until: string | null;
};

export function isSuspendedAt(suspendedUntil: string | null | undefined) {
  if (!suspendedUntil) {
    return false;
  }

  return new Date(suspendedUntil).getTime() > Date.now();
}

export async function getChatSuspensionStatus() {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("chat_service_state")
    .select("suspended_until")
    .eq("id", 1)
    .maybeSingle();

  const row = data as ServiceStateRow | null;
  const suspendedUntil = row?.suspended_until ?? null;

  return {
    suspendedUntil,
    isSuspended: isSuspendedAt(suspendedUntil),
  };
}
