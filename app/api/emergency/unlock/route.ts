import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { isEmergencyUnlockCode } from "@/lib/chat-emergency";
import { createServerSupabase } from "@/lib/supabase/server";

type UnlockRequest = {
  code?: string;
  updatedBy?: string;
};

function normalizeUpdatedBy(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "bubu" || normalized === "buggu") {
    return normalized;
  }
  return "bubu";
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: UnlockRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Please enter the secret code." },
      { status: 400 },
    );
  }

  if (!isEmergencyUnlockCode(body.code)) {
    return NextResponse.json({ message: "Wrong secret code." }, { status: 403 });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from("chat_service_state").upsert({
    id: 1,
    suspended_until: null,
    updated_at: new Date().toISOString(),
    updated_by: normalizeUpdatedBy(body.updatedBy),
  });

  if (error) {
    return NextResponse.json(
      { message: "Could not disable emergency mode right now." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
