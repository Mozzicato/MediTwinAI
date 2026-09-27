import type { NextRequest } from "next/server";
import { clinicalGate, handle } from "@/server/http";
import { loadTwin } from "@/server/twin-service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest, ctx: RouteContext<"/api/twins/[id]">) {
  const { id } = await ctx.params;
  const fresh = request.nextUrl.searchParams.get("fresh") === "1";
  return clinicalGate() ?? handle("load twin", async (trace) => ({ ...(await loadTwin(trace, id, { fresh })), trace: trace.entries }));
}
