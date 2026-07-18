import { auth } from "@clerk/nextjs/server";
import { authConfiguration } from "@/lib/auth-config";

export type AccessDecision =
  | { status: "configuration_required" }
  | { status: "signed_out" }
  | { status: "forbidden"; userId: string }
  | { status: "allowed"; userId: string };

export async function decideAccess(): Promise<AccessDecision> {
  const configuration = authConfiguration();
  if (!configuration.configured) return { status: "configuration_required" };

  const { userId } = await auth();
  if (!userId) return { status: "signed_out" };
  if (!configuration.allowedUserIds.has(userId)) {
    return { status: "forbidden", userId };
  }
  return { status: "allowed", userId };
}
