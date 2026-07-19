import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authConfiguration } from "@/lib/auth-config";
import { resolveAuthorizedParties } from "@/lib/clerk-authorized-parties";
import { restorePassThroughForExactSelfRewrite } from "@/lib/clerk-middleware-response";

const clerk = clerkMiddleware(() => undefined, (request) => {
  const configuration = authConfiguration();

  return {
    authorizedParties: resolveAuthorizedParties({
      configuredParties: configuration.authorizedParties,
      requestOrigin: request.nextUrl.origin,
      vercelEnv: process.env.VERCEL_ENV,
      vercelUrl: process.env.VERCEL_URL,
      vercelBranchUrl: process.env.VERCEL_BRANCH_URL,
    }),
    signInUrl: "/sign-in",
    signUpUrl: "/sign-up",
  };
});

export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
) {
  if (!authConfiguration().clerkReady) return NextResponse.next();

  const response = (await clerk(request, event)) ?? NextResponse.next();

  // Clerk decorates pass-through requests by rewriting them to their own URL.
  // Next 16's Node proxy treats that as an outbound proxy and recursively calls
  // this server. Preserve Clerk's request headers while restoring pass-through.
  return restorePassThroughForExactSelfRewrite(response, request.nextUrl);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
