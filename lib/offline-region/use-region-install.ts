"use client";

import { useCallback, useEffect, useState } from "react";
import {
  resolveJournalRegion,
  resolveRegionBaseUrl,
} from "@/lib/map-journal/region";
import { createRegionStore } from "@/lib/offline-region/store";
import type {
  RegionDownloadProgress,
  RegionManifest,
} from "@/lib/offline-region/types";

export type RegionInstallPhase = "loading" | "missing" | "ready";

export type RegionInstallState = {
  phase: RegionInstallPhase;
  region: string;
  baseUrl: string;
  manifest: RegionManifest | null;
  downloading: boolean;
  progress: RegionDownloadProgress | null;
  error: string | null;
  download: () => Promise<void>;
};

/**
 * Product Offline Region install state (OPFS pack via createRegionStore).
 * Shared by home hero, Map Journal empty state, and the Offline page.
 */
export function useRegionInstall(
  requestedRegion: string | null = null,
): RegionInstallState {
  const region = resolveJournalRegion(requestedRegion);
  const baseUrl = resolveRegionBaseUrl(region);
  const [phase, setPhase] = useState<RegionInstallPhase>("loading");
  const [manifest, setManifest] = useState<RegionManifest | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<RegionDownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(async () => {
    const store = createRegionStore(baseUrl, region);
    const next =
      manifest ??
      (await store.manifest());
    if (!next) {
      setError("No Offline Region pack is published for this install.");
      setPhase("missing");
      setManifest(null);
      return;
    }
    setManifest(next);
    setPhase("missing");
    setDownloading(true);
    setError(null);
    setProgress({
      downloadedBytes: 0,
      totalBytes: next.totalBytes,
      currentPath: "",
    });
    try {
      await store.install(next, (update) => setProgress(update));
      setPhase("ready");
    } catch {
      setError(
        "The Offline Region download could not be verified. Stay online and try again.",
      );
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  }, [baseUrl, region, manifest]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const store = createRegionStore(baseUrl, region);
      const installed = await store.installed();
      if (!active) return;
      if (installed) {
        setManifest(installed);
        setPhase("ready");
        return;
      }
      const published = await store.manifest();
      if (!active) return;
      setManifest(published);
      setPhase("missing");
    })();
    return () => {
      active = false;
    };
  }, [baseUrl, region]);

  return {
    phase,
    region,
    baseUrl,
    manifest,
    downloading,
    progress,
    error,
    download,
  };
}
