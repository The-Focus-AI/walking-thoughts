import { authConfiguration } from "@/lib/auth-config";
import { getSelectedGatewayModel } from "@/lib/enrichment/gateway";

export type ServiceStatus = "ok" | "degraded" | "error" | "not_configured";

export type ServiceHealth = {
  status: ServiceStatus;
  /** Human-readable and secret-free by construction. */
  detail: string;
};

export type HealthReport = {
  status: "ok" | "degraded" | "configuration_required";
  environment: string;
  services: {
    database: ServiceHealth;
    objectStorage: ServiceHealth;
    clerk: ServiceHealth;
    gateway: ServiceHealth;
    queue: ServiceHealth;
    push: ServiceHealth;
  };
};

export type HealthProbes = {
  /** Round-trip the database; throws on failure. */
  database(databaseUrl: string): Promise<void>;
  /** Count open Enrichment jobs; null when the queue table does not exist yet. */
  queueDepth(databaseUrl: string): Promise<number | null>;
};

type Environment = Record<string, string | undefined>;

function clerkHealth(environment: Environment): ServiceHealth {
  const configuration = authConfiguration(environment);
  if (configuration.configured) {
    return { status: "ok", detail: "Keys, allowlist, and origins configured" };
  }
  if (!configuration.productionReady) {
    return {
      status: "error",
      detail:
        "Production requires live keys and one canonical authorized origin",
    };
  }
  return {
    status: "not_configured",
    detail: "Clerk keys or the allowed-user list are missing",
  };
}

function gatewayHealth(environment: Environment): ServiceHealth {
  const configured = Boolean(
    environment.AI_GATEWAY_API_KEY || environment.VERCEL_OIDC_TOKEN,
  );
  const model = getSelectedGatewayModel(environment);
  if (!configured) {
    return {
      status: "not_configured",
      detail: `No gateway credential; Enrichment would use model ${model}`,
    };
  }
  return {
    status: "ok",
    detail: `Vercel AI Gateway configured; selected model ${model}`,
  };
}

function pushHealth(environment: Environment): ServiceHealth {
  const publicKey = Boolean(
    environment.NEXT_PUBLIC_VAPID_PUBLIC_KEY || environment.VAPID_PUBLIC_KEY,
  );
  const privateKey = Boolean(environment.VAPID_PRIVATE_KEY);
  if (publicKey && privateKey) {
    return { status: "ok", detail: "VAPID key pair configured" };
  }
  if (publicKey || privateKey) {
    return {
      status: "error",
      detail: "VAPID configuration is incomplete (one key of the pair missing)",
    };
  }
  return { status: "not_configured", detail: "Web push VAPID keys are missing" };
}

async function databaseHealth(
  environment: Environment,
  probes: HealthProbes,
): Promise<ServiceHealth> {
  const url = environment.DATABASE_URL;
  if (!url) {
    return {
      status: "not_configured",
      detail: "DATABASE_URL is missing; synchronization uses in-memory records",
    };
  }
  try {
    await probes.database(url);
    return { status: "ok", detail: "Database round-trip succeeded" };
  } catch {
    return { status: "error", detail: "Database round-trip failed" };
  }
}

async function queueHealth(
  environment: Environment,
  probes: HealthProbes,
): Promise<ServiceHealth> {
  const url = environment.DATABASE_URL;
  if (!url) {
    return {
      status: "not_configured",
      detail: "Durable Enrichment queue requires the database",
    };
  }
  try {
    const depth = await probes.queueDepth(url);
    if (depth === null) {
      return {
        status: "ok",
        detail: "Queue tables are created on first Enrichment",
      };
    }
    return { status: "ok", detail: `${depth} open Enrichment job(s)` };
  } catch {
    return { status: "error", detail: "Queue inspection failed" };
  }
}

function objectStorageHealth(environment: Environment): ServiceHealth {
  if (!environment.BLOB_READ_WRITE_TOKEN) {
    return {
      status: "not_configured",
      detail:
        "BLOB_READ_WRITE_TOKEN is missing; media uses the in-process store",
    };
  }
  return {
    status: "ok",
    detail: "Private Vercel Blob store configured (access: private)",
  };
}

export async function collectHealth(
  environment: Environment,
  probes: HealthProbes,
): Promise<HealthReport> {
  const services = {
    database: await databaseHealth(environment, probes),
    objectStorage: objectStorageHealth(environment),
    clerk: clerkHealth(environment),
    gateway: gatewayHealth(environment),
    queue: await queueHealth(environment, probes),
    push: pushHealth(environment),
  };

  const clerkConfigured = services.clerk.status === "ok";
  const anyError = Object.values(services).some(
    (service) => service.status === "error",
  );

  return {
    status: !clerkConfigured
      ? "configuration_required"
      : anyError
        ? "degraded"
        : "ok",
    environment: environment.VERCEL_ENV || "development",
    services,
  };
}
