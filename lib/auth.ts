import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "private_chat_session";
export const NITEM_GATE_COOKIE = "nitem_gate_session";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function getSessionSecret() {
  return process.env.CHAT_SESSION_SECRET ?? "local-dev-session-secret";
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("hex");
}

function safeEquals(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  return (
    aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer)
  );
}

export function createSessionToken() {
  const issuedAt = Date.now().toString();
  return `${issuedAt}.${sign(issuedAt)}`;
}

export function createNitemGateToken() {
  const issuedAt = Date.now().toString();
  const payload = `nitem.${issuedAt}`;
  return `${payload}.${sign(payload)}`;
}

export function isValidSessionToken(token?: string) {
  if (!token) {
    return false;
  }

  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature || !safeEquals(signature, sign(issuedAt))) {
    return false;
  }

  const ageInMs = Date.now() - Number(issuedAt);
  return Number.isFinite(ageInMs) && ageInMs <= COOKIE_MAX_AGE * 1000;
}

export function isValidNitemGateToken(token?: string) {
  if (!token) {
    return false;
  }

  const [scope, issuedAt, signature] = token.split(".");
  if (
    scope !== "nitem" ||
    !issuedAt ||
    !signature ||
    !safeEquals(signature, sign(`${scope}.${issuedAt}`))
  ) {
    return false;
  }

  const ageInMs = Date.now() - Number(issuedAt);
  return Number.isFinite(ageInMs) && ageInMs <= COOKIE_MAX_AGE * 1000;
}

export async function isAuthenticated() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const nitemGate = cookieStore.get(NITEM_GATE_COOKIE)?.value;

  return isValidSessionToken(token) && isValidNitemGateToken(nitemGate);
}
