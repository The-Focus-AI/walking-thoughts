/**
 * Production and preview must use separate Clerk, Neon, Blob, gateway, push,
 * and Enrichment-queue (Neon job) resources. Vault profiles in fnox.toml map
 * 1:1 onto Vercel environments via `mise run vercel:sync`.
 */
export const INTEGRATION_ENVIRONMENTS = [
  "development",
  "preview",
  "production",
] as const;

export type IntegrationEnvironment = (typeof INTEGRATION_ENVIRONMENTS)[number];

export type SeparatedResources = {
  clerk: string;
  neon: string;
  blob: string;
  gateway: string;
  push: string;
  queue: string;
};

export function expectedResourceSeparation(
  environment: IntegrationEnvironment,
): SeparatedResources {
  const label =
    environment === "production"
      ? "Production"
      : environment === "preview"
        ? "Preview"
        : "Development";
  return {
    clerk: `${label} Clerk application`,
    neon: `${label} Neon database`,
    blob: `${label} private Vercel Blob store`,
    gateway: `${label} Vercel AI Gateway credentials`,
    push: `${label} VAPID keypair`,
    queue: `${label} Neon Enrichment job tables`,
  };
}

export function fnoxProfileFor(
  environment: IntegrationEnvironment,
): "default" | "preview" | "prod" {
  if (environment === "production") return "prod";
  if (environment === "preview") return "preview";
  return "default";
}
