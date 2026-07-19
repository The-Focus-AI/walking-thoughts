import { authConfiguration } from "@/lib/auth-config";

export type ServiceStatus = "ready" | "missing" | "error";

export type ServiceReport = {
  status: ServiceStatus;
  detail?: string;
  private?: boolean;
};

export type IntegrationHealthReport = {
  status: "ok" | "degraded" | "configuration_required";
  environment: "production" | "preview" | "development" | "unknown";
  services: {
    clerk: ServiceReport;
    database: ServiceReport;
    blob: ServiceReport;
    gateway: ServiceReport;
    queue: ServiceReport;
    push: ServiceReport;
  };
  transport: {
    httpsRequiredInProduction: boolean;
    canonicalOriginConfigured: boolean;
  };
};

export type HealthProbeResults = {
  database: { ok: boolean; reason?: string };
  blob: { ok: boolean; privateAccess?: boolean; reason?: string };
  queue: { ok: boolean; reason?: string };
};

type Environment = Record<string, string | undefined>;

function environmentName(
  environment: Environment,
): IntegrationHealthReport["environment"] {
  const value = environment.VERCEL_ENV ?? environment.NODE_ENV;
  if (value === "production" || value === "preview" || value === "development") {
    return value;
  }
  return "unknown";
}

function configured(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

function fromProbe(
  configuredFlag: boolean,
  probe: { ok: boolean; reason?: string },
  missingDetail: string,
): ServiceReport {
  if (!configuredFlag) {
    return { status: "missing", detail: missingDetail };
  }
  if (!probe.ok) {
    return { status: "error", detail: probe.reason ?? "probe_failed" };
  }
  return { status: "ready" };
}

/**
 * Pure reporter for `/api/health`. Never includes secret values — only
 * ready/missing/error plus non-sensitive detail codes.
 */
export function reportIntegrationHealth(
  environment: Environment,
  probes: HealthProbeResults,
): IntegrationHealthReport {
  const auth = authConfiguration(environment);
  const clerk: ServiceReport = auth.configured
    ? { status: "ready" }
    : auth.clerkReady
      ? { status: "missing", detail: "allowlist_or_production_origin" }
      : { status: "missing", detail: "clerk_keys" };

  const database = fromProbe(
    configured(environment.DATABASE_URL),
    probes.database,
    "DATABASE_URL",
  );

  const blobBase = fromProbe(
    configured(environment.BLOB_READ_WRITE_TOKEN),
    probes.blob,
    "BLOB_READ_WRITE_TOKEN",
  );
  const blob: ServiceReport = {
    ...blobBase,
    private:
      blobBase.status === "ready" ? Boolean(probes.blob.privateAccess) : false,
  };

  const gateway: ServiceReport = configured(environment.AI_GATEWAY_API_KEY)
    ? { status: "ready" }
    : { status: "missing", detail: "AI_GATEWAY_API_KEY" };

  const queue = fromProbe(
    configured(environment.DATABASE_URL),
    probes.queue,
    "DATABASE_URL",
  );

  const pushReady =
    configured(
      environment.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? environment.VAPID_PUBLIC_KEY,
    ) && configured(environment.VAPID_PRIVATE_KEY);
  const push: ServiceReport = pushReady
    ? { status: "ready" }
    : { status: "missing", detail: "VAPID_KEYS" };

  const services = { clerk, database, blob, gateway, queue, push };
  const statuses = Object.values(services).map((service) => service.status);
  let status: IntegrationHealthReport["status"] = "ok";
  if (clerk.status !== "ready") {
    status = "configuration_required";
  } else if (statuses.some((value) => value !== "ready")) {
    status = "degraded";
  }

  const appUrl = environment.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  return {
    status,
    environment: environmentName(environment),
    services,
    transport: {
      httpsRequiredInProduction: environment.VERCEL_ENV === "production",
      canonicalOriginConfigured: appUrl.startsWith("https://"),
    },
  };
}
