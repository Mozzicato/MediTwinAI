import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readJson, withUser } from "@/server/http";
import { getOnboarding, saveProfile } from "@/server/personal/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withUser(request, "profile", (user) => getOnboarding(user));
}

export async function PUT(request: NextRequest) {
  const body = await readJson(request, z.object({
    firstName: z.string().trim().min(1).max(60),
    birthYear: z.number().int(),
    sex: z.enum(["male", "female", "unspecified"]),
    consent: z.literal(true),
  }));
  if (body instanceof NextResponse) return body;
  return withUser(request, "save profile", async (user) => {
    await saveProfile(user, { firstName: body.firstName, birthYear: body.birthYear, sex: body.sex });
    return getOnboarding(user);
  });
}
