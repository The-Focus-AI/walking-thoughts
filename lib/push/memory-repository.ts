import type { PushRepository, PushSubscriptionRecord } from "./types";

type MemoryPushState = {
  subscriptions: Map<string, PushSubscriptionRecord>;
  events: Set<string>;
};

const states = new Map<string, MemoryPushState>();

function createState(): MemoryPushState {
  return {
    subscriptions: new Map(),
    events: new Set(),
  };
}

function stateFor(namespace: string): MemoryPushState {
  const existing = states.get(namespace);
  if (existing) return existing;
  const created = createState();
  states.set(namespace, created);
  return created;
}

export function resetMemoryPushRepository(namespace = "default"): void {
  states.set(namespace, createState());
}

export function createMemoryPushRepository(
  namespace = "default",
): PushRepository {
  const state = () => stateFor(namespace);

  return {
    async upsertSubscription(userId, subscription) {
      const db = state();
      const key = `${userId}:${subscription.endpoint}`;
      const existing = db.subscriptions.get(key);
      const record: PushSubscriptionRecord = {
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        createdAt: existing?.createdAt ?? subscription.createdAt ?? new Date().toISOString(),
      };
      db.subscriptions.set(key, record);
      return record;
    },

    async listSubscriptions(userId) {
      const db = state();
      return [...db.subscriptions.entries()]
        .filter(([key]) => key.startsWith(`${userId}:`))
        .map(([, record]) => record);
    },

    async deleteSubscription(userId, endpoint) {
      state().subscriptions.delete(`${userId}:${endpoint}`);
    },

    async claimNotificationEvent(userId, eventKey) {
      const db = state();
      const key = `${userId}:${eventKey}`;
      if (db.events.has(key)) return false;
      db.events.add(key);
      return true;
    },
  };
}
