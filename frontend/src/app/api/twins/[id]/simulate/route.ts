import { NextResponse } from "next/server";
import { z } from "zod";
import { clinicalGate, handle, readJson } from "@/server/http";
import { simulateTwin } from "@/server/twin-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/twins/[id]/simulate">) {
  const gate = clinicalGate();
  if (gate) return gate;
  const { id } = await ctx.params;
  const body = await readJson(request, z.object({
    type: z.enum(["hba1c_trajectory", "ldl_trajectory"]),
    durationMonths: z.number().int().min(1).max(24),
  }));
  if (body instanceof NextResponse) return body;
  return handle("simulate", (trace) => simulateTwin(trace, id, body.type, body.durationMonths));
}
