export const allowedEmail = process.env.CLERK_E2E_ALLOWED_EMAIL;
export const disallowedEmail = process.env.CLERK_E2E_DISALLOWED_EMAIL;

export const clerkRuntimeConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY &&
    process.env.CLERK_ALLOWED_USER_IDS,
);

export const clerkE2EConfigured = Boolean(
  clerkRuntimeConfigured && allowedEmail && disallowedEmail,
);
