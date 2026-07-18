export type BlobPutInput = {
  userId: string;
  attachmentId: string;
  mimeType: string;
  bytes: Uint8Array;
  operationId: string;
};

export type BlobObject = {
  userId: string;
  attachmentId: string;
  mimeType: string;
  bytes: Uint8Array;
  operationId: string;
};

export type PrivateBlobStore = {
  put(
    input: BlobPutInput,
  ): Promise<{ attachmentId: string; duplicate: boolean }>;
  get(userId: string, attachmentId: string): Promise<BlobObject | null>;
  existsForOtherUser?(userId: string, attachmentId: string): Promise<boolean>;
};

type MemoryState = {
  objects: Map<string, BlobObject>;
  operations: Map<string, string>;
};

const states = new Map<string, MemoryState>();

function stateFor(namespace: string): MemoryState {
  const existing = states.get(namespace);
  if (existing) return existing;
  const created = { objects: new Map(), operations: new Map() };
  states.set(namespace, created);
  return created;
}

export function resetMemoryBlobStore(namespace = "default"): void {
  states.set(namespace, { objects: new Map(), operations: new Map() });
}

export function createMemoryBlobStore(
  namespace = "default",
): PrivateBlobStore {
  const state = () => stateFor(namespace);

  return {
    async put(input) {
      const db = state();
      const opKey = `${input.userId}:${input.operationId}`;
      const existingOp = db.operations.get(opKey);
      if (existingOp) {
        return { attachmentId: existingOp, duplicate: true };
      }

      const key = `${input.userId}:${input.attachmentId}`;
      db.objects.set(key, {
        userId: input.userId,
        attachmentId: input.attachmentId,
        mimeType: input.mimeType,
        bytes: input.bytes,
        operationId: input.operationId,
      });
      db.operations.set(opKey, input.attachmentId);
      return { attachmentId: input.attachmentId, duplicate: false };
    },
    async get(userId, attachmentId) {
      return state().objects.get(`${userId}:${attachmentId}`) ?? null;
    },
    async existsForOtherUser(userId, attachmentId) {
      for (const object of state().objects.values()) {
        if (
          object.attachmentId === attachmentId &&
          object.userId !== userId
        ) {
          return true;
        }
      }
      return false;
    },
  };
}
