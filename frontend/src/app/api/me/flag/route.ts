import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readJson, symptomInputSchema, withUser } from "@/server/http";
import { flagPersonal } from "@/server/personal/service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const body = await readJson(request, z.object({ symptoms: symptomInputSchema }));
  if (body instanceof NextResponse) return body;
  return withUser(request, "personal flag", async (user, trace) => ({ ...(await flagPersonal(trace, user, body.symptoms)), trace: trace.entries }));
}
