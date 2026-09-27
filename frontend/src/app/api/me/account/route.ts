import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE } from "@/lib/local-auth";
import { HttpError } from "@/server/http-error";
import { readJson, withUser } from "@/server/http";
import { deleteAccount } from "@/server/personal/service";

export const dynamic = "force-dynamic";

/** Permanently delete the account. The person must retype their email to confirm. */
export async function DELETE(request: NextRequest) {
  const body = await readJson(request, z.object({ confirmEmail: z.string().max(254) }));
  if (body instanceof NextResponse) return body;
  const result = await withUser(request, "delete account", async (user) => {
    if (body.confirmEmail.trim().toLowerCase() !== user.email) throw new HttpError(400, "The email you typed doesn't match your account.");
    await deleteAccount(user);
    return { ok: true };
  });
  if (result.ok) result.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0 });
  return result;
}
