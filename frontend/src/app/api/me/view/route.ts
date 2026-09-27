import type { NextRequest } from "next/server";
import { withUser } from "@/server/http";
import { personalView } from "@/server/personal/service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  return withUser(request, "personal view", async (user, trace) => ({ ...(await personalView(trace, user)), trace: trace.entries }));
}
