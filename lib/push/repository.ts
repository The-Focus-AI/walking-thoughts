import { createMemoryPushRepository } from "./memory-repository";
import { createNeonPushRepository } from "./neon-repository";
import type { PushRepository } from "./types";

export function getPushRepository(
  environment: NodeJS.ProcessEnv = process.env,
): PushRepository {
  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl) {
    return createNeonPushRepository(databaseUrl);
  }
  return createMemoryPushRepository("default");
}
