import { NextResponse } from "next/server";
import { getClinicalReadiness } from "@/lib/clinical-config";
import { integrationStatus } from "@/server/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = getClinicalReadiness();
  return NextResponse.json({ ...readiness, integrations: integrationStatus() }, { status: readiness.ready ? 200 : 503 });
}
