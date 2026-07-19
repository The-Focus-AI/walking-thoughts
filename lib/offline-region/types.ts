export type RegionFile = {
  path: string;
  bytes: number;
  sha256: string;
};

export type RegionSource = {
  id: string;
  description: string;
  license: string;
  attribution: string;
};

export type RegionManifest = {
  version: number;
  region: string;
  name: string;
  center: { latitude: number; longitude: number };
  radiusKm: number;
  bounds: [number, number, number, number];
  generatedAt: string;
  artifacts: RegionFile[];
  fonts: RegionFile[];
  totalBytes: number;
  sources: RegionSource[];
  attribution: string;
};

export type RegionDownloadProgress = {
  downloadedBytes: number;
  totalBytes: number;
  currentPath: string;
};

export type RegionStorage = {
  persisted: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
};
