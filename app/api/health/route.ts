import { authConfiguration } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

export function GET() {
  const configuration = authConfiguration();
  return Response.json(
    {
      status: configuration.configured ? "ok" : "configuration_required",
      services: {
        clerkPublishableKey: configuration.publishableKey,
        clerkSecretKey: configuration.secretKey,
        allowedUsers: configuration.allowedUserIds.size > 0,
      },
    },
    {
      status: configuration.configured ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
