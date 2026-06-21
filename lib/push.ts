import webpush from "web-push";

const VAPID_SUBJECT =
  process.env.WEB_PUSH_SUBJECT ?? "mailto:admin@niftem.ac.in";
const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
  "BHzgeuqtm3r-4IxJWifuJzebSdpjU6HP0gBIgcAR7GaK_Rss3W8-GI9L3xleiTLWnmKJ-B0jXQpBM_AfmpVwYK0";
const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ??
  "fU74yllmOV11UclWkfLqXgC-dwq-vo0F5JTwbWTbXPE";

let configured = false;

function ensureConfigured() {
  if (configured) {
    return;
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
}

export function getVapidPublicKey() {
  return VAPID_PUBLIC_KEY;
}

export async function sendWebPush(
  subscription: webpush.PushSubscription,
  payload: Record<string, string>,
) {
  ensureConfigured();
  return webpush.sendNotification(subscription, JSON.stringify(payload));
}
