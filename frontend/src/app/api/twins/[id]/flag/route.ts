import { NextResponse } from "next/server";
import { z } from "zod";
import { clinicalGate, handle, readJson, symptomInputSchema } from "@/server/http";
import { flagSignal } from "@/server/twin-service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The signal is recomputed server-side from the symptoms; the browser can't write arbitrary text to a twin.
export async function POST(request: Request, ctx: RouteContext<"/api/twins/[id]/flag">) {
  const gate = clinicalGate();
  if (gate) return gate;
  const { id } = await ctx.params;
  const body = await readJson(request, z.object({ symptoms: symptomInputSchema }));
  if (body instanceof NextResponse) return body;
  return handle("flag signal", async (trace) => ({ ...(await flagSignal(trace, id, body.symptoms)), trace: trace.entries }));
}
