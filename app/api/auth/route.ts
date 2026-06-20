import { NextResponse } from "next/server";
import {
  COOKIE_MAX_AGE,
  SESSION_COOKIE,
  createSessionToken,
} from "@/lib/auth";

export async function POST(request: Request) {
  const configuredPassword = process.env.CHAT_PASSWORD;

  if (!configuredPassword) {
    return NextResponse.json(
      { message: "Chat password is not configured on the server." },
      { status: 500 },
    );
  }

  let body: { password?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Password is required." },
      { status: 400 },
    );
  }

  if (body.password !== configuredPassword) {
    return NextResponse.json(
      { message: "That password does not match." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return response;
}
