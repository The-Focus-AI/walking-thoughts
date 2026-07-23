import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { authConfiguration } from "@/lib/auth-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Walking Thoughts",
  description: "Reliable offline Capture with online intelligence.",
  applicationName: "Walking Thoughts",
};

export const viewport: Viewport = {
  themeColor: "#17231b",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const content = (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/barlow-condensed-600.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/barlow-condensed-500.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );

  return authConfiguration().clerkReady ? (
    <ClerkProvider>{content}</ClerkProvider>
  ) : (
    content
  );
}
