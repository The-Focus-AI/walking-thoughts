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
export type LatLng = {
  latitude: number;
  longitude: number;
};

export type RegionSelection = {
  center: LatLng;
  /** Default home selection is ~40 km / 25 mi. */
  radiusKm: number;
  name?: string;
};

export type PackEstimate = {
  radiusKm: number;
  radiusMiles: number;
  estimatedBytes: number;
  assetCount: number;
};

export type PackAssetDescriptor = {
  id: string;
  path: string;
  byteLength: number;
  checksum: string;
};

export type OfflineRegionManifest = {
  regionId: string;
  version: number;
  center: LatLng;
  radiusKm: number;
  name: string;
  createdAt: string;
  assets: PackAssetDescriptor[];
  /** Trail-first style marker so offline render is not a generic cache view. */
  style: {
    priority: "trails";
    layers: string[];
  };
};

export type DownloadProgress = {
  regionId: string;
  version: number;
  completedAssetIds: string[];
  totalAssets: number;
  receivedBytes: number;
  totalBytes: number;
};

export type VerifiedPack = {
  manifest: OfflineRegionManifest;
  verifiedAt: string;
  installedBytes: number;
};

export type OfflineRegionStatus =
  | { state: "empty" }
  | {
      state: "active";
      pack: VerifiedPack;
      download?: DownloadProgress | null;
    }
  | {
      state: "downloading";
      progress: DownloadProgress;
      preservedActive: VerifiedPack | null;
    }
  | {
      state: "error";
      code: "quota" | "integrity" | "network" | "storage";
      message: string;
      actionable: string;
      preservedActive: VerifiedPack | null;
    };

export type OfflineMapView = {
  source: "offline_region";
  regionId: string;
  version: number;
  center: LatLng;
  radiusKm: number;
  layers: string[];
  trailPriority: true;
  assetPaths: string[];
};

export type PackCatalog = {
  plan(selection: RegionSelection): Promise<OfflineRegionManifest>;
  fetchAsset(
    regionId: string,
    version: number,
    assetId: string,
  ): Promise<Uint8Array>;
};

export type PackStore = {
  readManifest(slot: "active" | "staging"): Promise<OfflineRegionManifest | null>;
  writeManifest(
    slot: "active" | "staging",
    manifest: OfflineRegionManifest,
  ): Promise<void>;
  readProgress(): Promise<DownloadProgress | null>;
  writeProgress(progress: DownloadProgress | null): Promise<void>;
  putAsset(
    slot: "active" | "staging",
    assetId: string,
    bytes: Uint8Array,
  ): Promise<void>;
  getAsset(
    slot: "active" | "staging",
    assetId: string,
  ): Promise<Uint8Array | null>;
  listAssetIds(slot: "active" | "staging"): Promise<string[]>;
  clearSlot(slot: "active" | "staging"): Promise<void>;
  activateStaging(): Promise<void>;
};

export type OfflineRegionManager = {
  defaultSelection(home: LatLng): RegionSelection;
  estimatePack(selection: RegionSelection): PackEstimate;
  getStatus(): Promise<OfflineRegionStatus>;
  startDownload(
    selection: RegionSelection,
    catalog?: PackCatalog,
  ): Promise<OfflineRegionStatus>;
  resumeDownload(catalog?: PackCatalog): Promise<OfflineRegionStatus>;
  renderOffline(): Promise<OfflineMapView>;
};
