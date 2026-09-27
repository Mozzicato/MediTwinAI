import type { NextRequest } from "next/server";
import { withUser } from "@/server/http";
import { deleteEntry } from "@/server/personal/service";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/me/entries/[id]">) {
  const { id } = await ctx.params;
  return withUser(request, "delete entry", async (user) => { await deleteEntry(user, id); return { ok: true }; });
}
