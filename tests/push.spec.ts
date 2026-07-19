import { expect, test } from "@playwright/test";
import { createFakeGatewayClient } from "@/lib/enrichment/gateway";
import {
  createMemoryEnrichmentRepository,
  resetMemoryEnrichmentRepository,
} from "@/lib/enrichment/memory-repository";
import { processPendingEnrichments } from "@/lib/enrichment/process";
import {
  enablePushNotifications,
  evaluatePushOptInAfterSync,
  type PushClient,
} from "@/lib/push/client";
import {
  createMemoryPushRepository,
  resetMemoryPushRepository,
} from "@/lib/push/memory-repository";
import {
  buildPushPayload,
  notificationEventKey,
  notifyEnrichmentOutcome,
} from "@/lib/push/notify";
import { decidePushOptInOffer } from "@/lib/push/opt-in";
import { createRecordingPushSender } from "@/lib/push/send";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

const NS = "push-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryEnrichmentRepository(NS);
  resetMemoryPushRepository(NS);
});

test("offers push opt-in only after the first successful sync batch", () => {
  expect(
    decidePushOptInOffer({
      successfulSyncResultCount: 0,
      alreadyOffered: false,
      permission: "default",
    }),
  ).toBe("skip_no_sync");

  expect(
    decidePushOptInOffer({
      successfulSyncResultCount: 2,
      alreadyOffered: false,
      permission: "default",
    }),
  ).toBe("offer");

  expect(
    decidePushOptInOffer({
      successfulSyncResultCount: 2,
      alreadyOffered: true,
      permission: "default",
    }),
  ).toBe("skip_already_offered");

  expect(
    decidePushOptInOffer({
      successfulSyncResultCount: 2,
      alreadyOffered: false,
      permission: "denied",
    }),
  ).toBe("skip_already_decided");

  expect(
    decidePushOptInOffer({
      successfulSyncResultCount: 2,
      alreadyOffered: false,
      permission: "unsupported",
    }),
  ).toBe("skip_unsupported");
});

test("evaluatePushOptInAfterSync marks offered once and reports denial", () => {
  const storage = new Map<string, string>();
  const store = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  };
  const client: PushClient = {
    getPermission: () => "default",
    requestPermission: async () => "default",
    subscribe: async () => null,
    registerSubscription: async () => false,
  };

  const first = evaluatePushOptInAfterSync({
    successfulSyncResultCount: 1,
    storage: store,
    client,
  });
  expect(first).toEqual({ status: "offer" });

  const second = evaluatePushOptInAfterSync({
    successfulSyncResultCount: 1,
    storage: store,
    client,
  });
  expect(second).toEqual({ status: "idle" });

  const deniedClient: PushClient = {
    ...client,
    getPermission: () => "denied",
  };
  expect(
    evaluatePushOptInAfterSync({
      successfulSyncResultCount: 1,
      storage: {
        getItem: () => null,
        setItem: () => undefined,
      },
      client: deniedClient,
    }),
  ).toEqual({ status: "denied" });
});

test("enablePushNotifications records denial without breaking the flow", async () => {
  const client: PushClient = {
    getPermission: () => "default",
    requestPermission: async () => "denied",
    subscribe: async () => null,
    registerSubscription: async () => false,
  };
  await expect(
    enablePushNotifications({
      vapidPublicKey: "test-key",
      client,
    }),
  ).resolves.toEqual({ status: "denied" });
});

test("notifies once for completion and suppresses duplicates", async () => {
  const push = createMemoryPushRepository(NS);
  const sent: Array<{ endpoint: string; payload: ReturnType<typeof buildPushPayload> }> =
    [];
  const sender = createRecordingPushSender(sent);

  await push.upsertSubscription("user_a", {
    endpoint: "https://push.example/a",
    p256dh: "p256",
    auth: "auth",
  });

  const event = {
    kind: "complete" as const,
    jobId: "job-1",
    threadId: "thread-1",
    title: "Creek owl",
  };
  expect(notificationEventKey(event)).toBe("enrichment:job-1:complete");

  const first = await notifyEnrichmentOutcome("user_a", event, push, sender);
  const second = await notifyEnrichmentOutcome("user_a", event, push, sender);
  expect(first).toBe("sent");
  expect(second).toBe("suppressed");
  expect(sent).toHaveLength(1);
  expect(sent[0]?.payload.title).toBe("Creek owl");
});

test("drops stale subscriptions that the push service reports as gone", async () => {
  const push = createMemoryPushRepository(NS);
  const sent: Array<{ endpoint: string; payload: ReturnType<typeof buildPushPayload> }> =
    [];
  const sender = createRecordingPushSender(sent, {
    goneEndpoints: new Set(["https://push.example/stale"]),
  });

  await push.upsertSubscription("user_a", {
    endpoint: "https://push.example/stale",
    p256dh: "p256",
    auth: "auth",
  });
  await push.upsertSubscription("user_a", {
    endpoint: "https://push.example/live",
    p256dh: "p256",
    auth: "auth",
  });

  const result = await notifyEnrichmentOutcome(
    "user_a",
    {
      kind: "needs_attention",
      jobId: "job-2",
      threadId: "thread-1",
      reason: "gateway_timeout",
    },
    push,
    sender,
  );
  expect(result).toBe("sent");
  expect(sent.map((entry) => entry.endpoint)).toEqual([
    "https://push.example/live",
  ]);
  const remaining = await push.listSubscriptions("user_a");
  expect(remaining.map((entry) => entry.endpoint)).toEqual([
    "https://push.example/live",
  ]);
});

test("processPendingEnrichments notifies once on complete and once on needs attention", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const push = createMemoryPushRepository(NS);
  const sent: Array<{ endpoint: string; payload: ReturnType<typeof buildPushPayload> }> =
    [];
  const sender = createRecordingPushSender(sent);

  await push.upsertSubscription("user_a", {
    endpoint: "https://push.example/a",
    p256dh: "p256",
    auth: "auth",
  });

  await threads.upsertCaptures("user_a", [
    {
      id: "cap-1",
      text: "Barred owl call",
      createdAt: "2026-07-18T12:00:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-1",
    },
  ]);

  const gateway = createFakeGatewayClient(async ({ model, requestTitle }) => ({
    text: requestTitle ? "TITLE: Creek owl\nLikely a barred owl." : "Follow-up",
    model,
    title: requestTitle ? "Creek owl" : null,
  }));

  await processPendingEnrichments("user_a", enrichment, {
    gateway,
    threadRepository: threads,
    pushRepository: push,
    pushSender: sender,
  });
  expect(sent).toHaveLength(1);
  expect(sent[0]?.payload.tag).toContain(":complete");

  // Replay with nothing pending: no duplicate notification.
  await processPendingEnrichments("user_a", enrichment, {
    gateway,
    threadRepository: threads,
    pushRepository: push,
    pushSender: sender,
  });
  expect(sent).toHaveLength(1);

  await threads.upsertCaptures("user_a", [
    {
      id: "cap-2",
      text: "Broken follow-up",
      createdAt: "2026-07-18T12:05:00.000Z",
      location: null,
      threadId: "cap-1",
      sequence: 2,
      idempotencyKey: "cap-2",
    },
  ]);

  let attempts = 0;
  const failing = createFakeGatewayClient(async () => {
    attempts += 1;
    throw new Error("gateway_timeout");
  });

  await processPendingEnrichments("user_a", enrichment, {
    gateway: failing,
    threadRepository: threads,
    pushRepository: push,
    pushSender: sender,
  });
  expect(sent).toHaveLength(2);
  expect(sent[1]?.payload.tag).toContain(":needs_attention");

  // Listing the same failed job again must not notify twice.
  await processPendingEnrichments("user_a", enrichment, {
    gateway: failing,
    threadRepository: threads,
    pushRepository: push,
    pushSender: sender,
  });
  expect(sent).toHaveLength(2);
  expect(attempts).toBe(1);

  // Requeue + fail again newly enters needs attention → one more notify.
  await processPendingEnrichments("user_a", enrichment, {
    gateway: failing,
    retryFailed: true,
    threadRepository: threads,
    pushRepository: push,
    pushSender: sender,
  });
  expect(sent).toHaveLength(3);
  expect(sent[2]?.payload.tag).toContain(":needs_attention:a");
  expect(attempts).toBe(2);
});
