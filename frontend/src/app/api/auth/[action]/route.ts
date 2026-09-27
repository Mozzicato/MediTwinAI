import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, authenticateLocalUser, clearAttempts, createLocalUser, createSession,
  isLocalAuthConfigured, readSession, recordFailedAttempt, tooManyAttempts, userExists,
} from "@/lib/local-auth";
import { isClinicalMode } from "@/lib/clinical-config";

function authDisabled() {
  return NextResponse.json({ detail: "Accounts are disabled in clinical mode." }, { status: 403 });
}

function authNotConfigured() {
  return NextResponse.json({ detail: "Accounts need DATABASE_URL, TURSO_AUTH_TOKEN and LOCAL_AUTH_SESSION_SECRET on the server." }, { status: 503 });
}

const cookieOptions = { httpOnly: true, path: "/", sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action !== "me") return NextResponse.json({ detail: "Not found" }, { status: 404 });
  if (isClinicalMode()) return authDisabled();
  if (!isLocalAuthConfigured()) return NextResponse.json({ user: null, accountsEnabled: false });
  const user = readSession(request.cookies.get(SESSION_COOKIE)?.value);
  return NextResponse.json({ user: user && (await userExists(user.id)) ? user : null, accountsEnabled: true });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (isClinicalMode()) return authDisabled();
  if (!isLocalAuthConfigured()) return authNotConfigured();
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ detail: "Cross-site request refused." }, { status: 403 });

  if (action === "signout") {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return response;
  }
  if (action !== "signup" && action !== "signin") return NextResponse.json({ detail: "Not found" }, { status: 404 });

  const payload = await request.json().catch(() => ({})) as { email?: string; password?: string };
  const email = payload.email?.trim() ?? "";
  const password = payload.password ?? "";
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 200) {
    return NextResponse.json({ detail: "Enter a valid email and a password of at least 8 characters." }, { status: 400 });
  }

  const limiterKey = `${email.toLowerCase()}|${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"}`;
  if (action === "signin" && tooManyAttempts(limiterKey)) {
    return NextResponse.json({ detail: "Too many attempts. Please wait 15 minutes and try again." }, { status: 429 });
  }

  const user = action === "signup" ? await createLocalUser(email, password) : await authenticateLocalUser(email, password);
  if (!user) {
    if (action === "signin") recordFailedAttempt(limiterKey);
    return NextResponse.json({ detail: action === "signup" ? "An account with this email already exists." : "Email or password is incorrect." }, { status: action === "signup" ? 409 : 401 });
  }
  clearAttempts(limiterKey);

  const response = NextResponse.json({ user });
  response.cookies.set(SESSION_COOKIE, createSession(user), { ...cookieOptions, maxAge: SESSION_MAX_AGE_SECONDS });
  return response;
}
