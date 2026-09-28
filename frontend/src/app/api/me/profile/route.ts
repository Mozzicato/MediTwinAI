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
    sex: z.enum(["male", "female", "intersex"]),
    heightCm: z.number().min(50).max(250),
    weightKg: z.number().min(20).max(350),
    skinTone: z.enum(["I", "II", "III", "IV", "V", "VI"]),
    consent: z.literal(true),
  }));
  if (body instanceof NextResponse) return body;
  return withUser(request, "save profile", async (user, trace) => {
    await saveProfile(trace, user, { firstName: body.firstName, birthYear: body.birthYear, sex: body.sex, heightCm: body.heightCm, weightKg: body.weightKg, skinTone: body.skinTone });
    return getOnboarding(user);
  });
}
