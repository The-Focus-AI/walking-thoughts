/**
 * Resolve Clerk `authorizedParties` for the current request.
 *
 * Production stays locked to the configured canonical origin(s).
 * Preview/development always include the request origin (and Vercel URL
 * helpers) so branch deployments do not reject a valid session and bounce
 * `/` ↔ `/sign-in`.
 */
export function resolveAuthorizedParties(input: {
  configuredParties: readonly string[];
  requestOrigin: string;
  vercelEnv?: string;
  vercelUrl?: string;
  vercelBranchUrl?: string;
}): string[] {
  if (input.vercelEnv === "production") {
    return [...input.configuredParties];
  }

  const parties = new Set(input.configuredParties);
  parties.add(input.requestOrigin);

  for (const host of [input.vercelUrl, input.vercelBranchUrl]) {
    if (!host) continue;
    try {
      parties.add(
        host.startsWith("http://") || host.startsWith("https://")
          ? new URL(host).origin
          : `https://${host}`,
      );
    } catch {
      // Ignore malformed Vercel URL helpers.
    }
  }

  return [...parties];
}
