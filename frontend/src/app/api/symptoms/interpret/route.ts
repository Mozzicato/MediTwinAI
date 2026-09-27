import { NextResponse } from "next/server";
import { z } from "zod";
import { interpretSymptoms } from "@/server/ai";
import { clinicalGate, handle, readJson } from "@/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const gate = clinicalGate();
  if (gate) return gate;
  const body = await readJson(request, z.object({ text: z.string().trim().min(3).max(400) }));
  if (body instanceof NextResponse) return body;
  return handle("interpret symptoms", async (trace) => ({ ...(await interpretSymptoms(trace, body.text)), trace: trace.entries }));
}
