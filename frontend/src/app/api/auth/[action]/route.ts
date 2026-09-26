import { NextRequest, NextResponse } from "next/server";
import { authenticateLocalUser, createLocalUser, createSession, isLocalAuthConfigured, readSession } from "@/lib/local-auth";
import { isClinicalMode } from "@/lib/clinical-config";

const sessionCookie = "meditwin_local_session";

function localAuthDisabled() {
  return NextResponse.json({ detail: "Local authentication is disabled in clinical mode." }, { status: 403 });
}

function localAuthNotConfigured() {
  return NextResponse.json({ detail: "Local authentication requires Turso database credentials and LOCAL_AUTH_SESSION_SECRET in hosted production." }, { status: 503 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action !== "me") return NextResponse.json({ detail: "Not found" }, { status: 404 });
  if (isClinicalMode()) return localAuthDisabled();
  if (!isLocalAuthConfigured()) return localAuthNotConfigured();
  const user = readSession(request.cookies.get(sessionCookie)?.value);
  return NextResponse.json({ user });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (isClinicalMode()) return localAuthDisabled();
  if (!isLocalAuthConfigured()) return localAuthNotConfigured();

  if (action === "signout") {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookie, "", { httpOnly: true, maxAge: 0, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    return response;
  }

  const payload = await request.json() as { email?: string; password?: string };
  const email = payload.email?.trim() ?? "";
  const password = payload.password ?? "";
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return NextResponse.json({ detail: "Enter a valid email and a password of at least 8 characters." }, { status: 400 });
  }

  const user = action === "signup" ? await createLocalUser(email, password) : action === "signin" ? await authenticateLocalUser(email, password) : null;
  if (!user) return NextResponse.json({ detail: action === "signup" ? "An account with this email already exists." : "Email or password is incorrect." }, { status: 401 });

  const response = NextResponse.json({ user });
  response.cookies.set(sessionCookie, createSession(user), { httpOnly: true, maxAge: 60 * 60 * 8, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return response;
}