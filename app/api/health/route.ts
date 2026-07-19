import { reportIntegrationHealth } from "@/lib/integrations/health";
import { probeIntegrationDependencies } from "@/lib/integrations/probes";

export const dynamic = "force-dynamic";

export async function GET() {
  const probes = await probeIntegrationDependencies();
  const report = reportIntegrationHealth(process.env, probes);
  const httpStatus =
    report.status === "configuration_required"
      ? 503
      : report.status === "degraded"
        ? 200
        : 200;

  return Response.json(report, {
    status: httpStatus,
    headers: { "Cache-Control": "no-store" },
  });
}
