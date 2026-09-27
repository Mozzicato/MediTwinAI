import { NextResponse, type NextRequest } from "next/server";
import { withUser } from "@/server/http";
import { exportData } from "@/server/personal/service";

export const dynamic = "force-dynamic";

/** Download everything MediTwin stores about the signed-in person, decrypted, as JSON. */
export async function GET(request: NextRequest) {
  const result = await withUser(request, "export", (user) => exportData(user));
  if (!result.ok) return result;
  return new NextResponse(await result.text(), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="meditwin-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
