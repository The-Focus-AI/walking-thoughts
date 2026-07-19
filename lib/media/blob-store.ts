import {
  createMemoryBlobStore,
  type PrivateBlobStore,
} from "./memory-blob-store";
import { createVercelBlobStore } from "./vercel-blob-store";

export function getPrivateBlobStore(
  environment: NodeJS.ProcessEnv = process.env,
): PrivateBlobStore {
  const token = environment.BLOB_READ_WRITE_TOKEN;
  // Without a token (tests, local development) the in-process store is the seam.
  if (!token) {
    return createMemoryBlobStore("default");
  }
  return createVercelBlobStore(token);
}
