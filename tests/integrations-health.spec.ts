import { expect, test } from "@playwright/test";
import {
  reportIntegrationHealth,
  type HealthProbeResults,
} from "@/lib/integrations/health";

function probes(overrides: Partial<HealthProbeResults> = {}): HealthProbeResults {
  return {
    database: { ok: true },
    blob: { ok: true, privateAccess: true },
    queue: { ok: true },
    ...overrides,
  };
}

test("integration health reports each service without embedding secret values", () => {
  const report = reportIntegrationHealth(
    {
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example",
      CLERK_SECRET_KEY: "sk_test_example",
      CLERK_ALLOWED_USER_IDS: "user_owner",
      DATABASE_URL: "postgres://secret-user:secret-pass@host/db",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_secret",
      AI_GATEWAY_API_KEY: "gateway_secret",
      AI_GATEWAY_MODEL: "anthropic/claude-sonnet-5",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "vapid_public",
      VAPID_PRIVATE_KEY: "vapid_private",
    },
    probes(),
  );

  expect(report.environment).toBe("preview");
  expect(report.services.clerk.status).toBe("ready");
  expect(report.services.database.status).toBe("ready");
  expect(report.services.blob.status).toBe("ready");
  expect(report.services.blob.private).toBe(true);
  expect(report.services.gateway.status).toBe("ready");
  expect(report.services.queue.status).toBe("ready");
  expect(report.services.push.status).toBe("ready");
  expect(report.status).toBe("ok");

  const serialized = JSON.stringify(report);
  expect(serialized).not.toContain("secret-pass");
  expect(serialized).not.toContain("gateway_secret");
  expect(serialized).not.toContain("vercel_blob_rw_secret");
  expect(serialized).not.toContain("vapid_private");
  expect(serialized).not.toMatch(/(?:pk|sk)_(?:test|live)_/);
});

test("missing or failing probes surface degraded service status", () => {
  const report = reportIntegrationHealth(
    {
      VERCEL_ENV: "production",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_example",
      CLERK_SECRET_KEY: "sk_live_example",
      CLERK_ALLOWED_USER_IDS: "user_owner",
      NEXT_PUBLIC_APP_URL: "https://walking-thoughts.thefocus.ai",
      CLERK_AUTHORIZED_PARTIES: "https://walking-thoughts.thefocus.ai",
    },
    probes({
      database: { ok: false, reason: "unreachable" },
      blob: { ok: false, reason: "token_missing" },
      queue: { ok: false, reason: "database_unavailable" },
    }),
  );

  expect(report.services.database.status).toBe("error");
  expect(report.services.blob.status).toBe("missing");
  expect(report.services.gateway.status).toBe("missing");
  expect(report.services.push.status).toBe("missing");
  expect(report.services.queue.status).toBe("error");
  expect(report.status).toBe("degraded");
});
