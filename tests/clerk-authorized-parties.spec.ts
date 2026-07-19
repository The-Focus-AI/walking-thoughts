import { expect, test } from "@playwright/test";
import { resolveAuthorizedParties } from "@/lib/clerk-authorized-parties";

test("production keeps authorized parties locked to the configured origin", () => {
  expect(
    resolveAuthorizedParties({
      configuredParties: ["https://walking-thoughts.thefocus.ai"],
      requestOrigin: "https://walking-thoughts-git-cursor-offline-regions-c293-thefocusai.vercel.app",
      vercelEnv: "production",
    }),
  ).toEqual(["https://walking-thoughts.thefocus.ai"]);
});

test("preview includes the request origin so branch deploys do not reject sessions", () => {
  const preview =
    "https://walking-thoughts-git-cursor-offline-regions-c293-thefocusai.vercel.app";
  expect(
    resolveAuthorizedParties({
      configuredParties: ["https://walking-thoughts.thefocus.ai"],
      requestOrigin: preview,
      vercelEnv: "preview",
      vercelUrl: "walking-thoughts-git-cursor-offline-regions-c293-thefocusai.vercel.app",
      vercelBranchUrl:
        "walking-thoughts-git-cursor-offline-regions-c293-thefocusai.vercel.app",
    }).sort(),
  ).toEqual(
    [
      "https://walking-thoughts.thefocus.ai",
      preview,
    ].sort(),
  );
});

test("development includes localhost even when configured parties are empty", () => {
  expect(
    resolveAuthorizedParties({
      configuredParties: [],
      requestOrigin: "http://127.0.0.1:3103",
      vercelEnv: undefined,
    }),
  ).toEqual(["http://127.0.0.1:3103"]);
});
