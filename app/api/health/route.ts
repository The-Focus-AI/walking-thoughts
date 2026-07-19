import { collectHealth } from "@/lib/operations/health";
import { createNeonHealthProbes } from "@/lib/operations/probes";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await collectHealth(process.env, createNeonHealthProbes());
  return Response.json(report, {
    status: report.status === "configuration_required" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
