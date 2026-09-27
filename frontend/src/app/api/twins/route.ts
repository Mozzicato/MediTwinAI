import { clinicalGate, handle } from "@/server/http";
import { listTwins } from "@/server/twin-service";

export const dynamic = "force-dynamic";

export async function GET() {
  return clinicalGate() ?? handle("list twins", async (trace) => ({ twins: await listTwins(trace), trace: trace.entries }));
}
