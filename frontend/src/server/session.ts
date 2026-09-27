import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession, userExists, type SessionUser } from "@/lib/local-auth";

/**
 * Resolve the signed-in user for a personal-data route. Rejects cross-site writes (the session
 * cookie is SameSite=Lax, and mutating requests must come from this origin) and sessions whose
 * account has been deleted.
 */
export async function requireUser(request: NextRequest): Promise<SessionUser | NextResponse> {
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ detail: "Cross-site request refused." }, { status: 403 });
  }
  const user = readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user || !(await userExists(user.id))) return NextResponse.json({ detail: "Please sign in to continue." }, { status: 401 });
  return user;
}
