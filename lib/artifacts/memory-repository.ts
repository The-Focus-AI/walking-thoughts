import {
  toArtifactSummary,
  type ArtifactRepository,
  type ThreadArtifact,
} from "./types";

type MemoryArtifactState = {
  /** userId:artifactId -> artifact */
  artifacts: Map<string, ThreadArtifact>;
};

const states = new Map<string, MemoryArtifactState>();

function createState(): MemoryArtifactState {
  return { artifacts: new Map() };
}

function stateFor(namespace: string): MemoryArtifactState {
  const existing = states.get(namespace);
  if (existing) return existing;
  const created = createState();
  states.set(namespace, created);
  return created;
}

export function resetMemoryArtifactRepository(namespace = "default"): void {
  states.set(namespace, createState());
}

/** Development and test store; a deployment without DATABASE_URL uses it. */
export function createMemoryArtifactRepository(
  namespace = "default",
): ArtifactRepository {
  const state = () => stateFor(namespace);
  const own = (userId: string) => (key: string) => key.startsWith(`${userId}:`);

  return {
    async saveArtifact(userId, artifact, options) {
      const db = state();
      const key = `${userId}:${artifact.id}`;
      const existing = db.artifacts.get(key);
      if (existing && !options?.replace) {
        return { artifact: existing, created: false };
      }
      db.artifacts.set(key, artifact);
      return { artifact, created: !existing };
    },

    async getArtifact(userId, artifactId) {
      return state().artifacts.get(`${userId}:${artifactId}`) ?? null;
    },

    async listArtifacts(userId) {
      return [...state().artifacts.entries()]
        .filter(([key]) => own(userId)(key))
        .map(([, artifact]) => toArtifactSummary(artifact))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },

    async listThreadArtifacts(userId, threadId) {
      return [...state().artifacts.entries()]
        .filter(([key]) => own(userId)(key))
        .map(([, artifact]) => artifact)
        .filter((artifact) => artifact.threadId === threadId)
        .map(toArtifactSummary)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
  };
}
