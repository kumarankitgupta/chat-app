import { NextResponse } from "next/server";
import {
  COOKIE_MAX_AGE,
  NITEM_GATE_COOKIE,
  SESSION_COOKIE,
  createNitemGateToken,
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

  let body: { password?: string; name?: string; studentId?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Password is required." },
      { status: 400 },
    );
  }

  const normalizedName = body.name?.trim().toLowerCase();
  const normalizedStudentId = body.studentId?.trim();

  if (
    body.password !== configuredPassword ||
    normalizedName !== "buggu" ||
    normalizedStudentId !== configuredPassword
  ) {
    return NextResponse.json(
      { message: "Wrong credential" },
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
  response.cookies.set(NITEM_GATE_COOKIE, createNitemGateToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return response;
}
