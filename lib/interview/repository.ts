import { createMemoryInterviewRepository } from "./memory-repository";
import { createNeonInterviewRepository } from "./neon-repository";
import type { InterviewRepository } from "./types";

export function getInterviewRepository(
  environment: NodeJS.ProcessEnv = process.env,
): InterviewRepository {
  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl) {
    return createNeonInterviewRepository(databaseUrl);
  }
  return createMemoryInterviewRepository("default");
}
