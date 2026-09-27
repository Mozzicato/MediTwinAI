import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readJson, withUser } from "@/server/http";
import { simulatePersonal } from "@/server/personal/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await readJson(request, z.object({ type: z.enum(["hba1c_trajectory", "ldl_trajectory"]), durationMonths: z.number().int().min(1).max(24) }));
  if (body instanceof NextResponse) return body;
  return withUser(request, "personal simulate", (user, trace) => simulatePersonal(trace, user, body.type, body.durationMonths));
}
