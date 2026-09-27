import { NextResponse } from "next/server";
import { z } from "zod";
import { clinicalGate, handle, readJson, symptomInputSchema } from "@/server/http";
import { analyzeTwin } from "@/server/twin-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/twins/[id]/analyze">) {
  const gate = clinicalGate();
  if (gate) return gate;
  const { id } = await ctx.params;
  const body = await readJson(request, z.object({ symptoms: symptomInputSchema }));
  if (body instanceof NextResponse) return body;
  return handle("analyze", (trace) => analyzeTwin(trace, id, body.symptoms));
}
