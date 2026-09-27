import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SessionUser } from "@/lib/local-auth";
import { requireUser } from "./session";
import { z } from "zod";
import { getClinicalReadiness, isClinicalMode } from "@/lib/clinical-config";
import { HttpError } from "./http-error";
import { DtpError } from "./ontomorph/dtp";
import { Trace } from "./trace";

/** Clinical mode never serves sandbox data (docs/CLINICAL_LAUNCH.md). */
export function clinicalGate() {
  if (!isClinicalMode()) return null;
  return NextResponse.json({ detail: "Clinical data access is not activated.", readiness: getClinicalReadiness() }, { status: 503 });
}

export const symptomInputSchema = z.array(z.object({
  id: z.string().max(40),
  severity: z.enum(["mild", "moderate", "severe"]),
  durationDays: z.number().int().min(0).max(3650),
  userWording: z.string().max(200).optional(),
})).max(12);

export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T> | NextResponse> {
  const body = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ detail: "The request was not in the expected format." }, { status: 400 });
  return parsed.data;
}

/** Run a handler with a trace, mapping integration failures onto the PRD's user-facing messages. */
export async function handle(label: string, run: (trace: Trace) => Promise<unknown>) {
  const trace = new Trace(label);
  try {
    const result = await run(trace);
    return result instanceof NextResponse ? result : NextResponse.json(result);
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ detail: error.message, ...error.extra }, { status: error.status });
    if (error instanceof DtpError) {
      const status = error.status === 404 ? 404 : error.status >= 400 && error.status < 500 ? 422 : 502;
      const detail = status === 404 ? "We couldn't find that digital twin."
        : status === 422 ? "The digital twin service couldn't process this request."
        : "We couldn't connect to your digital twin. Please try again.";
      return NextResponse.json({ detail, code: error.code, trace: trace.entries }, { status });
    }
    console.error(JSON.stringify({ at: new Date().toISOString(), request: label, error: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ detail: "Something went wrong while preparing your health view. Please try again.", trace: trace.entries }, { status: 500 });
  }
}

/** Clinical gate + signed-in user + trace, for personal-data routes. */
export async function withUser(request: NextRequest, label: string, run: (user: SessionUser, trace: Trace) => Promise<unknown>) {
  const gate = clinicalGate();
  if (gate) return gate;
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;
  return handle(label, (trace) => run(user, trace));
}
