export type AuthConfiguration = {
  clerkReady: boolean;
  configured: boolean;
  publishableKey: boolean;
  secretKey: boolean;
  allowedUserIds: ReadonlySet<string>;
  authorizedParties: string[];
  productionReady: boolean;
};

type Environment = Record<string, string | undefined>;

function commaSeparated(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function authConfiguration(
  environment: Environment = process.env,
): AuthConfiguration {
  const publishableValue = environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const secretValue = environment.CLERK_SECRET_KEY ?? "";
  const publishableKey = Boolean(publishableValue);
  const secretKey = Boolean(secretValue);
  const allowedUserIds = new Set(
    commaSeparated(environment.CLERK_ALLOWED_USER_IDS),
  );
  const authorizedParties = commaSeparated(
    environment.CLERK_AUTHORIZED_PARTIES,
  );
  const isProduction = environment.VERCEL_ENV === "production";
  const canonicalOrigin = (() => {
    try {
      return new URL(environment.NEXT_PUBLIC_APP_URL ?? "").origin;
    } catch {
      return "";
    }
  })();
  const productionReady =
    !isProduction ||
    (publishableValue.startsWith("pk_live_") &&
      secretValue.startsWith("sk_live_") &&
      canonicalOrigin.startsWith("https://") &&
      authorizedParties.length === 1 &&
      authorizedParties[0] === canonicalOrigin);
  const clerkReady = publishableKey && secretKey && productionReady;

  return {
    clerkReady,
    configured: clerkReady && allowedUserIds.size > 0,
    publishableKey,
    secretKey,
    allowedUserIds,
    authorizedParties,
    productionReady,
  };
}
