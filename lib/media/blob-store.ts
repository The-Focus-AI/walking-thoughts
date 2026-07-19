import {
  createMemoryBlobStore,
  type PrivateBlobStore,
} from "./memory-blob-store";
import { createVercelBlobStore } from "./vercel-blob-store";

export function getPrivateBlobStore(
  environment: NodeJS.ProcessEnv = process.env,
): PrivateBlobStore {
  const token = environment.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    return createMemoryBlobStore("default");
  }

  // Prefer the real private Blob store when a token is configured. Tests that
  // need isolation keep using createMemoryBlobStore directly.
  return createVercelBlobStore(token);
}
