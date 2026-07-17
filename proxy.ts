import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authConfiguration } from "@/lib/auth-config";

const clerk = clerkMiddleware(() => undefined, (request) => ({
  authorizedParties: authConfiguration().authorizedParties.length
    ? authConfiguration().authorizedParties
    : request.nextUrl.hostname === "localhost" ||
        request.nextUrl.hostname === "127.0.0.1"
      ? [request.nextUrl.origin]
      : [],
}));

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!authConfiguration().configured) return NextResponse.next();
  return clerk(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
