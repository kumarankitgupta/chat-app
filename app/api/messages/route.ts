import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { sendWebPush } from "@/lib/push";

type MediaType = "image" | "video";

type MessagePayload = {
  body?: string | null;
  media_url?: string | null;
  media_path?: string | null;
  media_type?: MediaType | null;
  sender_id?: string;
  sender_name?: string;
  reply_to_id?: string | null;
  reply_to_sender_name?: string | null;
  reply_to_body?: string | null;
  reply_to_media_type?: MediaType | null;
};

type PushSubscriptionRow = {
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
};

const SECRET_NOTIFICATION_TEXT =
  "Now you can raise you student Query at Niftem portal";

function isAllowedUser(user?: string) {
  return user === "bubu" || user === "buggu";
}

function isMissingReplyColumnError(error: { message?: string; code?: string }) {
  return (
    error.code === "42703" ||
    error.message?.includes("reply_to_id") ||
    error.message?.includes("reply_to_body") ||
    error.message?.includes("reply_to_sender_name") ||
    error.message?.includes("reply_to_media_type")
  );
}

export async function POST(request: Request) {
  let payload: MessagePayload;

  try {
    payload = (await request.json()) as MessagePayload;
  } catch {
    return NextResponse.json({ message: "Invalid payload." }, { status: 400 });
  }

  if (!isAllowedUser(payload.sender_id) || !isAllowedUser(payload.sender_name)) {
    return NextResponse.json({ message: "Invalid sender." }, { status: 400 });
  }

  if (payload.sender_id !== payload.sender_name) {
    return NextResponse.json({ message: "Invalid sender." }, { status: 400 });
  }

  const hasBody = Boolean(payload.body?.trim());
  const hasMedia = Boolean(payload.media_url && payload.media_type);
  if (!hasBody && !hasMedia) {
    return NextResponse.json({ message: "Empty message." }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const rowPayload = {
    body: payload.body?.trim() || null,
    media_url: payload.media_url ?? null,
    media_path: payload.media_path ?? null,
    media_type: payload.media_type ?? null,
    sender_id: payload.sender_id,
    sender_name: payload.sender_name,
    reply_to_id: payload.reply_to_id ?? null,
    reply_to_sender_name: payload.reply_to_sender_name ?? null,
    reply_to_body: payload.reply_to_body ?? null,
    reply_to_media_type: payload.reply_to_media_type ?? null,
  };

  let { error: insertError } = await supabase.from("messages").insert(rowPayload);

  if (insertError && isMissingReplyColumnError(insertError)) {
    const {
      reply_to_id,
      reply_to_sender_name,
      reply_to_body,
      reply_to_media_type,
      ...fallbackPayload
    } = rowPayload;
    void reply_to_id;
    void reply_to_sender_name;
    void reply_to_body;
    void reply_to_media_type;
    ({ error: insertError } = await supabase.from("messages").insert(fallbackPayload));
  }

  if (insertError) {
    return NextResponse.json({ message: "Could not send message." }, { status: 500 });
  }

  const targetUser = payload.sender_id === "bubu" ? "buggu" : "bubu";
  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh_key, auth_key")
    .eq("user_id", targetUser);

  if (!subscriptionsError && subscriptions?.length) {
    await Promise.all(
      (subscriptions as PushSubscriptionRow[]).map(async (subscription) => {
        try {
          await sendWebPush(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh_key,
                auth: subscription.auth_key,
              },
            },
            {
              title: "NIFTEM Portal",
              body: SECRET_NOTIFICATION_TEXT,
              url: "/nitem-login",
            },
          );
        } catch (error: unknown) {
          const statusCode =
            typeof error === "object" &&
            error !== null &&
            "statusCode" in error &&
            typeof (error as { statusCode?: unknown }).statusCode === "number"
              ? (error as { statusCode: number }).statusCode
              : null;

          if (statusCode === 404 || statusCode === 410) {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", subscription.endpoint);
          }
        }
      }),
    );
  }

  return NextResponse.json({ ok: true });
}
