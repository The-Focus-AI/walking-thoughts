import { createMemoryArtifactRepository } from "./memory-repository";
import { createNeonArtifactRepository } from "./neon-repository";
import type { ArtifactRepository } from "./types";

export function getArtifactRepository(
  environment: NodeJS.ProcessEnv = process.env,
): ArtifactRepository {
  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl) return createNeonArtifactRepository(databaseUrl);
  return createMemoryArtifactRepository("default");
}
