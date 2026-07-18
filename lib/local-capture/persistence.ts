import type { PersistenceResult } from "./types";

export async function requestPersistentStorage(
  storage: StorageManager | null = typeof navigator === "undefined"
    ? null
    : (navigator.storage ?? null),
): Promise<PersistenceResult> {
  if (!storage || typeof storage.persist !== "function") {
    return "unsupported";
  }

  try {
    const persisted = await storage.persist();
    return persisted ? "persisted" : "not_persisted";
  } catch {
    return "not_persisted";
  }
}

export function persistenceLabel(result: PersistenceResult): string {
  switch (result) {
    case "persisted":
      return "Device storage: kept across visits";
    case "not_persisted":
      return "Device storage: not guaranteed";
    case "unsupported":
      return "Device storage: persistence unsupported";
  }
}
