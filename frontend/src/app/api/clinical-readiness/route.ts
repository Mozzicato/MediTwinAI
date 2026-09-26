import { NextResponse } from "next/server";
import { getClinicalReadiness } from "@/lib/clinical-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = getClinicalReadiness();
  return NextResponse.json(readiness, { status: readiness.ready ? 200 : 503 });
}