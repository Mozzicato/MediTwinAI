import { NextResponse } from "next/server";
import { assistantRequestSchema, assistantStream, rateLimited } from "@/server/assistant";
import { clinicalGate, readJson } from "@/server/http";
import { Trace } from "@/server/trace";
import { loadTwin } from "@/server/twin-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/twins/[id]/assistant">) {
  const gate = clinicalGate();
  if (gate) return gate;
  const { id } = await ctx.params;
  const body = await readJson(request, assistantRequestSchema);
  if (body instanceof NextResponse) return body;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
  if (rateLimited(`ip:${ip}`)) return NextResponse.json({ detail: "You're sending messages quickly. Please wait a minute and try again." }, { status: 429 });
  const trace = new Trace("sample assistant");
  // Sample twins are shared sandbox records, so the assistant never offers to write to them.
  return assistantStream(trace, body, { loadView: () => loadTwin(trace, id), canLog: false, sample: true, signal: request.signal });
}
