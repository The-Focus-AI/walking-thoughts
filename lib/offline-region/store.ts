import type {
  RegionDownloadProgress,
  RegionManifest,
  RegionStorage,
} from "./types";

const ROOT_DIRECTORY = "offline-region";
const MARKER_FILE = "installed.json";

async function regionDirectory(
  region: string,
  version: number,
  create: boolean,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const regions = await root.getDirectoryHandle(ROOT_DIRECTORY, { create });
    const owner = await regions.getDirectoryHandle(region, { create });
    return await owner.getDirectoryHandle(`v${version}`, { create });
  } catch {
    return null;
  }
}

async function resolveFile(
  directory: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
): Promise<FileSystemFileHandle> {
  const segments = path.split("/");
  let current = directory;
  for (const segment of segments.slice(0, -1)) {
    current = await current.getDirectoryHandle(segment, { create });
  }
  return current.getFileHandle(segments[segments.length - 1], { create });
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export class RegionIntegrityError extends Error {
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`Offline Region file ${path} failed verification: ${reason}`);
    this.name = "RegionIntegrityError";
    this.path = path;
  }
}

export type RegionStore = {
  manifest(): Promise<RegionManifest | null>;
  installed(): Promise<RegionManifest | null>;
  install(
    manifest: RegionManifest,
    onProgress?: (progress: RegionDownloadProgress) => void,
  ): Promise<void>;
  openFile(manifest: RegionManifest, path: string): Promise<File>;
  remove(manifest: RegionManifest): Promise<void>;
  storage(): Promise<RegionStorage>;
};

export function createRegionStore(baseUrl: string, region: string): RegionStore {
  return {
    async manifest() {
      try {
        const response = await fetch(`${baseUrl}/manifest.json`, {
          cache: "no-cache",
        });
        if (!response.ok) return null;
        return (await response.json()) as RegionManifest;
      } catch {
        return null;
      }
    },

    async installed() {
      try {
        const root = await navigator.storage.getDirectory();
        const regions = await root.getDirectoryHandle(ROOT_DIRECTORY, {
          create: false,
        });
        const owner = await regions.getDirectoryHandle(region, { create: false });

        let newest: RegionManifest | null = null;
        for await (const [, handle] of owner.entries()) {
          if (handle.kind !== "directory") continue;
          try {
            const marker = await (handle as FileSystemDirectoryHandle).getFileHandle(
              MARKER_FILE,
              { create: false },
            );
            const file = await marker.getFile();
            const manifest = JSON.parse(await file.text()) as RegionManifest;
            if (!newest || manifest.version > newest.version) newest = manifest;
          } catch {
            // An incomplete install has no marker; ignore it.
          }
        }
        return newest;
      } catch {
        return null;
      }
    },

    async install(manifest, onProgress) {
      const directory = await regionDirectory(region, manifest.version, true);
      if (!directory) {
        throw new Error("Origin-private file storage is unavailable");
      }

      const files = [...manifest.artifacts, ...manifest.fonts];
      let downloadedBytes = 0;

      for (const entry of files) {
        onProgress?.({
          downloadedBytes,
          totalBytes: manifest.totalBytes,
          currentPath: entry.path,
        });

        const response = await fetch(`${baseUrl}/${entry.path}`);
        if (!response.ok) {
          throw new RegionIntegrityError(entry.path, `download failed (${response.status})`);
        }
        const data = await response.arrayBuffer();
        if (data.byteLength !== entry.bytes) {
          throw new RegionIntegrityError(
            entry.path,
            `expected ${entry.bytes} bytes, received ${data.byteLength}`,
          );
        }
        const digest = await sha256Hex(data);
        if (digest !== entry.sha256) {
          throw new RegionIntegrityError(entry.path, "sha256 mismatch");
        }

        const handle = await resolveFile(directory, entry.path, true);
        const writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();

        downloadedBytes += entry.bytes;
        onProgress?.({
          downloadedBytes,
          totalBytes: manifest.totalBytes,
          currentPath: entry.path,
        });
      }

      // The marker is written last so an interrupted install is never
      // reported as an installed region.
      const marker = await directory.getFileHandle(MARKER_FILE, { create: true });
      const writable = await marker.createWritable();
      await writable.write(JSON.stringify(manifest));
      await writable.close();

      if (navigator.storage.persist) {
        await navigator.storage.persist().catch(() => false);
      }
    },

    async openFile(manifest, path) {
      const directory = await regionDirectory(region, manifest.version, false);
      if (!directory) {
        throw new Error(`Offline Region ${region} v${manifest.version} is not installed`);
      }
      const handle = await resolveFile(directory, path, false);
      return handle.getFile();
    },

    async remove(manifest) {
      try {
        const root = await navigator.storage.getDirectory();
        const regions = await root.getDirectoryHandle(ROOT_DIRECTORY, {
          create: false,
        });
        const owner = await regions.getDirectoryHandle(region, { create: false });
        await owner.removeEntry(`v${manifest.version}`, { recursive: true });
      } catch {
        // Already absent.
      }
    },

    async storage() {
      const persisted = navigator.storage.persisted
        ? await navigator.storage.persisted().catch(() => false)
        : false;
      const estimate = navigator.storage.estimate
        ? await navigator.storage.estimate().catch(() => null)
        : null;
      return {
        persisted,
        usageBytes: estimate?.usage ?? null,
        quotaBytes: estimate?.quota ?? null,
      };
    },
  };
}
