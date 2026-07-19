#!/usr/bin/env node
// Upload a built Offline Region pack directory to a public Vercel Blob store.
//
// Usage:
//   node scripts/offline-region/publish-region.mjs \
//     --dir public/offline-region/home --prefix offline-region/home
//
// Requires BLOB_REGION_READ_WRITE_TOKEN for the *public* regions Blob store.
// Do not reuse BLOB_READ_WRITE_TOKEN (private Capture media).
//
// Prints the public base URL (no trailing slash). Put that value in fnox as
// NEXT_PUBLIC_OFFLINE_REGION_HOME_BASE, then `mise run vercel:sync`.

import { put } from "@vercel/blob";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const dir = option("dir", "public/offline-region/home");
const prefix = option("prefix", "offline-region/home").replace(/\/+$/, "");
const concurrency = Number(option("concurrency", "4"));

const token = process.env.BLOB_REGION_READ_WRITE_TOKEN?.trim();
if (!token) {
  console.error(
    "Set BLOB_REGION_READ_WRITE_TOKEN (public regions store) before publishing.",
  );
  console.error(
    "Do not use BLOB_READ_WRITE_TOKEN — that token is for private media only.",
  );
  process.exit(1);
}

if (!fs.existsSync(path.join(dir, "manifest.json"))) {
  console.error(`No manifest.json under ${dir}. Run mise run region:build first.`);
  process.exit(1);
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".pmtiles")) return "application/octet-stream";
  if (filePath.endsWith(".pbf")) return "application/x-protobuf";
  return "application/octet-stream";
}

function walk(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(dir).sort();
let baseUrl = null;
let uploaded = 0;

async function uploadOne(filePath) {
  const relative = path.relative(dir, filePath).split(path.sep).join("/");
  const pathname = `${prefix}/${relative}`;
  const body = fs.readFileSync(filePath);
  const result = await put(pathname, body, {
    access: "public",
    token,
    contentType: contentTypeFor(relative),
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  if (!baseUrl) {
    const url = new URL(result.url);
    // Strip the file path after the prefix to get the pack base.
    const marker = `/${prefix}/`;
    const idx = url.pathname.indexOf(marker);
    if (idx < 0) {
      throw new Error(`Unexpected blob URL shape: ${result.url}`);
    }
    baseUrl = `${url.origin}${url.pathname.slice(0, idx + marker.length - 1)}`;
  }
  uploaded += 1;
  const mb = (body.byteLength / (1024 * 1024)).toFixed(2);
  console.error(`[${uploaded}/${files.length}] ${pathname} (${mb} MiB)`);
}

async function runPool(items, limit, worker) {
  let next = 0;
  async function pump() {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => pump()),
  );
}

console.error(`Publishing ${files.length} files from ${dir} → ${prefix}/`);
await runPool(files, concurrency, uploadOne);

if (!baseUrl) {
  console.error("No files uploaded.");
  process.exit(1);
}

console.log(baseUrl);
console.error("");
console.error(
  "Update fnox NEXT_PUBLIC_OFFLINE_REGION_HOME_BASE to the URL above,",
);
console.error("then run: mise run vercel:sync -- --env production");
console.error("          mise run vercel:sync -- --env preview");
