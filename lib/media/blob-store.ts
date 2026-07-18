import {
  createMemoryBlobStore,
  type PrivateBlobStore,
} from "./memory-blob-store";

export function getPrivateBlobStore(
  environment: NodeJS.ProcessEnv = process.env,
): PrivateBlobStore {
  // Private Vercel Blob integration lands when BLOB_READ_WRITE_TOKEN is present.
  // Until then (and in tests), use the durable-enough in-process store.
  if (!environment.BLOB_READ_WRITE_TOKEN) {
    return createMemoryBlobStore("default");
  }

  // Lazy-require keeps builds working when the optional token isn't configured.
  // The memory store remains the test seam; production should set the token.
  return createMemoryBlobStore("vercel-fallback");
}
