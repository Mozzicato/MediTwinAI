import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readJson, withUser } from "@/server/http";
import { addEntry } from "@/server/personal/service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const body = await readJson(request, z.object({
    typeId: z.string().max(40),
    values: z.record(z.string().max(30), z.number()),
    unit: z.string().max(20),
    occurredAt: z.string().max(40),
    note: z.string().max(500).optional(),
    syncToTwin: z.boolean(),
  }));
  if (body instanceof NextResponse) return body;
  return withUser(request, "add entry", (user, trace) => addEntry(trace, user, body));
}
