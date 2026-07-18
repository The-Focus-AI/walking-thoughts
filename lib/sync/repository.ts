import { createMemoryThreadRepository } from "./memory-repository";
import { createNeonThreadRepository } from "./neon-repository";
import type { ThreadRepository } from "./types";

export function getThreadRepository(
  environment: NodeJS.ProcessEnv = process.env,
): ThreadRepository {
  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl) {
    return createNeonThreadRepository(databaseUrl);
  }
  return createMemoryThreadRepository("default");
}
