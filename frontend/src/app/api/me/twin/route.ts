import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readJson, withUser } from "@/server/http";
import { connectTwin, disconnectTwin } from "@/server/personal/service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const body = await readJson(request, z.object({ grantToken: z.string().trim().min(20).max(8000) }));
  if (body instanceof NextResponse) return body;
  return withUser(request, "connect twin", (user, trace) => connectTwin(trace, user, body.grantToken));
}

export async function DELETE(request: NextRequest) {
  return withUser(request, "disconnect twin", async (user) => { await disconnectTwin(user); return { ok: true }; });
}
