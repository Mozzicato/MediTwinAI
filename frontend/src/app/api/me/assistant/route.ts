import { NextResponse, type NextRequest } from "next/server";
import { assistantRequestSchema, assistantStream, rateLimited } from "@/server/assistant";
import { clinicalGate, readJson } from "@/server/http";
import { cachedPersonalView } from "@/server/personal/service";
import { requireUser } from "@/server/session";
import { Trace } from "@/server/trace";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const gate = clinicalGate();
  if (gate) return gate;
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;
  const body = await readJson(request, assistantRequestSchema);
  if (body instanceof NextResponse) return body;
  if (rateLimited(`user:${user.id}`)) return NextResponse.json({ detail: "You're sending messages quickly. Please wait a minute and try again." }, { status: 429 });
  const trace = new Trace("personal assistant");
  return assistantStream(trace, body, { loadView: () => cachedPersonalView(trace, user), canLog: true, sample: false, signal: request.signal });
}
