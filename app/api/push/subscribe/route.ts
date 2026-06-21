import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type PushKeys = {
  p256dh?: string;
  auth?: string;
};

type SubscriptionPayload = {
  endpoint?: string;
  keys?: PushKeys;
};

type BodyPayload = {
  userId?: string;
  subscription?: SubscriptionPayload;
};

export async function POST(request: Request) {
  let body: BodyPayload;

  try {
    body = (await request.json()) as BodyPayload;
  } catch {
    return NextResponse.json({ message: "Invalid payload." }, { status: 400 });
  }

  const userId = body.userId?.trim();
  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;

  if (
    !userId ||
    (userId !== "bubu" && userId !== "buggu") ||
    !endpoint ||
    !p256dh ||
    !auth
  ) {
    return NextResponse.json({ message: "Invalid payload." }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint,
      user_id: userId,
      p256dh_key: p256dh,
      auth_key: auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json({ message: "Could not save subscription." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
