import { createMemoryThreadRepository } from "@/lib/sync/memory-repository";
import { getThreadRepository } from "@/lib/sync/repository";
import { createMemoryEnrichmentRepository } from "./memory-repository";
import { createNeonEnrichmentRepository } from "./neon-repository";
import type { EnrichmentRepository } from "./types";

export function getEnrichmentRepository(
  environment: NodeJS.ProcessEnv = process.env,
): EnrichmentRepository {
  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl) {
    return createNeonEnrichmentRepository(
      databaseUrl,
      getThreadRepository(environment),
    );
  }
  return createMemoryEnrichmentRepository(
    "default",
    createMemoryThreadRepository("default"),
  );
}
