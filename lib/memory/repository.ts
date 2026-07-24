import { createMemoryWalkerMemoryRepository } from "./memory-repository";
import { createNeonWalkerMemoryRepository } from "./neon-repository";
import type { WalkerMemoryRepository } from "./types";

export function getWalkerMemoryRepository(
  environment: NodeJS.ProcessEnv = process.env,
): WalkerMemoryRepository {
  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl) {
    return createNeonWalkerMemoryRepository(databaseUrl);
  }
  return createMemoryWalkerMemoryRepository("default");
}
