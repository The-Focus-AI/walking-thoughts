import { reportIntegrationHealth } from "@/lib/integrations/health";
import { probeIntegrationDependencies } from "@/lib/integrations/probes";

export const dynamic = "force-dynamic";

export async function GET() {
  const probes = await probeIntegrationDependencies();
  const report = reportIntegrationHealth(process.env, probes);

  return Response.json(report, {
    status: report.status === "configuration_required" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
