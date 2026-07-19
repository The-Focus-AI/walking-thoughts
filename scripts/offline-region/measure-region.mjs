#!/usr/bin/env node
// Measure a built Offline Region through the public /region-tracer seam on a
// Pixel-9-sized viewport: pack size, download time, install, render speed
// through the detailed zoom range, storage persistence, and airplane-mode
// rendering. Requires a production server (pnpm build && pnpm start) and the
// region artifacts in public/offline-region/<region>/.
//
// Usage: node scripts/offline-region/measure-region.mjs \
//   [--url http://127.0.0.1:3103] [--region home] [--shots /tmp/shots]

import { chromium, devices } from "@playwright/test";
import fs from "node:fs";

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const baseUrl = option("url", "http://127.0.0.1:3103");
const region = option("region", "home");
const shots = option("shots", "");
if (shots) fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices["Pixel 7"],
  viewport: { width: 412, height: 915 },
  baseURL: baseUrl,
  serviceWorkers: "allow",
});
const page = await context.newPage();

const tracer = () =>
  page.evaluate(() => {
    const hook = window.__WT_REGION_TRACER__;
    return hook ? { state: hook.state, metrics: hook.metrics } : null;
  });

await page.goto(`/region-tracer?region=${region}`);
await page.getByTestId("pack-size").waitFor({ timeout: 30_000 });
const offered = await tracer();

const downloadStarted = Date.now();
await page.getByRole("button", { name: "Download Offline Region" }).click();
await page.getByTestId("region-ready").waitFor({ timeout: 600_000 });
const downloadMs = Date.now() - downloadStarted;

await page
  .getByTestId("render-ms")
  .filter({ hasNotText: "measuring" })
  .waitFor({ timeout: 120_000 });
const installed = await tracer();

const zoomRenders = {};
for (const zoom of [11, 12, 13, 14, 15, 16, 17]) {
  const ms = await page.evaluate(async (z) => {
    const map = window.__WT_REGION_MAP__;
    const started = performance.now();
    map.setZoom(z);
    await new Promise((resolve) => map.once("idle", () => resolve()));
    return Math.round(performance.now() - started);
  }, zoom);
  zoomRenders[`z${zoom}`] = ms;
  if (shots) {
    await page.screenshot({ path: `${shots}/${region}-z${zoom}.png` });
  }
}

const panMs = await page.evaluate(async () => {
  const map = window.__WT_REGION_MAP__;
  map.setZoom(14);
  await new Promise((resolve) => map.once("idle", () => resolve()));
  const started = performance.now();
  map.panBy([300, 0], { duration: 0 });
  await new Promise((resolve) => map.once("idle", () => resolve()));
  return Math.round(performance.now() - started);
});

await context.setOffline(true);
const offlineStarted = Date.now();
await page.reload();
await page.getByTestId("region-ready").waitFor({ timeout: 60_000 });
await page
  .getByTestId("render-ms")
  .filter({ hasNotText: "measuring" })
  .waitFor({ timeout: 120_000 });
const airplane = await tracer();
const airplaneMs = Date.now() - offlineStarted;
const airplanePainted = await page.evaluate(() =>
  window.__WT_REGION_TRACER__.canvasPainted(),
);
if (shots) {
  await page.screenshot({ path: `${shots}/${region}-airplane-z13.png` });
}

console.log(
  JSON.stringify(
    {
      region,
      packBytes: offered?.metrics.packBytes,
      downloadMs,
      firstRenderMs: installed?.metrics.firstRenderMs,
      zoomRenders,
      panAtZ14Ms: panMs,
      storage: installed?.metrics.storage,
      airplaneMode: {
        reloadToRenderedMs: airplaneMs,
        firstRenderMs: airplane?.metrics.firstRenderMs,
        painted: airplanePainted,
      },
    },
    null,
    2,
  ),
);

await browser.close();
