import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Walking Thoughts",
    short_name: "Walking",
    description: "Reliable offline Capture with online intelligence.",
    // Pin the app's identity. Without `id`, Chrome derives it from
    // start_url, so anything that changes how the app is reached can leave
    // it holding a record of an app that is "installed" while the launcher
    // has no icon for it — and Chrome never offers to install an app it
    // believes is already there. Set to the current start_url so existing
    // installs keep the identity they already have.
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#17231b",
    theme_color: "#17231b",
    orientation: "portrait-primary",
    categories: ["productivity", "lifestyle", "travel"],
    // Chrome's install menu ("Install app") needs a 192 and a 512 with
    // purpose "any". A maskable-only 512 is fine for adaptive icons on the
    // home screen but does not satisfy that check on its own.
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
