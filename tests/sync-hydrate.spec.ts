import { expect, test } from "@playwright/test";
import { createMemoryCaptureStore } from "@/lib/local-capture/store";
import {
  resetSyncCycleForTests,
  runSyncCycle,
} from "@/lib/sync/cycle";
import type { ServerThread } from "@/lib/sync/types";

test.beforeEach(() => {
  resetSyncCycleForTests();
});

function phoneThread(overrides?: Partial<ServerThread>): ServerThread {
  return {
    id: "thread-phone",
    title: "Ridge line opens west",
    revision: 1,
    updatedAt: "2026-07-20T14:00:00.000Z",
    captures: [
      {
        id: "capture-phone",
        text: "Ridge line opens west",
        createdAt: "2026-07-20T14:00:00.000Z",
        location: {
          latitude: 41.82,
          longitude: -73.37,
          accuracy: 12,
        },
        sequence: 1,
        attachments: [
          {
            id: "att-phone",
            kind: "image",
            mimeType: "image/jpeg",
            fileName: "ridge.jpg",
          },
        ],
      },
    ],
    ...overrides,
  };
}

test("applyRemoteThreads imports server Captures onto an empty device without re-outboxing them", async () => {
  const desktop = createMemoryCaptureStore();

  await desktop.applyRemoteThreads([phoneThread()]);

  const listed = await desktop.list();
  expect(listed).toHaveLength(1);
  expect(listed[0]).toMatchObject({
    id: "capture-phone",
    text: "Ridge line opens west",
    status: "complete",
    threadId: "thread-phone",
    sequence: 1,
  });
  expect(listed[0]?.attachments[0]).toMatchObject({
    id: "att-phone",
    localObjectKey: null,
    remoteObjectKey: "att-phone",
    syncStatus: "complete",
  });

  const threads = await desktop.listRecentThreads();
  expect(threads).toEqual([
    expect.objectContaining({
      id: "thread-phone",
      title: "Ridge line opens west",
    }),
  ]);

  // Remote Completes must not re-enter the outbound outbox.
  let pushed = 0;
  await runSyncCycle({
    store: desktop,
    online: true,
    threadsTransport: {
      async listThreads() {
        return [phoneThread()];
      },
    },
    captureTransport: {
      async pushCaptures(captures) {
        pushed += captures.length;
        return { results: [], failures: [] };
      },
    },
    enrichmentTransport: {
      async process() {
        return { results: [], jobs: [] };
      },
    },
  });
  expect(pushed).toBe(0);
});

test("applyRemoteThreads leaves unsynced local Captures and Thread titles authoritative", async () => {
  const desktop = createMemoryCaptureStore();
  const local = await desktop.commit("Still only on this laptop", null, {
    destination: { type: "new_thread" },
  });
  const localTitle = (await desktop.listRecentThreads())[0]?.title;

  await desktop.applyRemoteThreads([
    {
      id: local.threadId!,
      title: "Server title should not clobber pending local",
      revision: 99,
      updatedAt: "2026-07-20T18:00:00.000Z",
      captures: [
        {
          id: local.id,
          text: "Server rewrite must not win",
          createdAt: local.createdAt,
          location: null,
          sequence: 1,
          attachments: [],
        },
      ],
    },
  ]);

  const after = await desktop.list();
  expect(after).toHaveLength(1);
  expect(after[0]?.text).toBe("Still only on this laptop");
  expect(after[0]?.status).toBe("saved_locally");
  expect((await desktop.listRecentThreads())[0]?.title).toBe(localTitle);
});

test("applyRemoteThreads re-homes synced Captures when the server splits a Thread", async () => {
  const desktop = createMemoryCaptureStore();
  await desktop.applyRemoteThreads([
    phoneThread({
      title: "Legacy day Thread",
      revision: 2,
      captures: [
        ...phoneThread().captures,
        {
          id: "capture-phone-2",
          text: "Second walk note",
          createdAt: "2026-07-20T15:00:00.000Z",
          location: null,
          sequence: 2,
          attachments: [],
        },
      ],
    }),
  ]);

  // Server splits the day Thread: each Capture now lives in its own Thread.
  await desktop.applyRemoteThreads([
    phoneThread({ title: "Ridge line opens west" }),
    {
      id: "capture-phone-2",
      title: "Second walk note",
      revision: 1,
      updatedAt: "2026-07-20T15:00:00.000Z",
      captures: [
        {
          id: "capture-phone-2",
          text: "Second walk note",
          createdAt: "2026-07-20T15:00:00.000Z",
          location: null,
          sequence: 1,
          attachments: [],
        },
      ],
    },
  ]);

  const captures = await desktop.list();
  expect(captures.find((c) => c.id === "capture-phone-2")).toMatchObject({
    threadId: "capture-phone-2",
    sequence: 1,
    status: "complete",
  });
  expect(captures.find((c) => c.id === "capture-phone")).toMatchObject({
    threadId: "thread-phone",
    sequence: 1,
  });
  const split = await desktop.listThread("capture-phone-2");
  expect(split.captures.map((c) => c.id)).toEqual(["capture-phone-2"]);
  const original = await desktop.listThread("thread-phone");
  expect(original.captures.map((c) => c.id)).toEqual(["capture-phone"]);
});

test("applyRemoteThreads does not surface Captures hidden by local Trash", async () => {
  const desktop = createMemoryCaptureStore();
  await desktop.applyRemoteThreads([phoneThread()]);
  await desktop.trashCapture("capture-phone");

  await desktop.applyRemoteThreads([phoneThread()]);

  expect(await desktop.list()).toEqual([]);
  expect(await desktop.listTrash()).toHaveLength(1);
});

test("applyRemoteThreads is idempotent and merges additional remote Captures into an existing Thread", async () => {
  const desktop = createMemoryCaptureStore();
  const first = phoneThread();
  await desktop.applyRemoteThreads([first]);
  await desktop.applyRemoteThreads([first]);

  expect(await desktop.list()).toHaveLength(1);

  await desktop.applyRemoteThreads([
    phoneThread({
      revision: 2,
      updatedAt: "2026-07-20T15:00:00.000Z",
      captures: [
        ...first.captures,
        {
          id: "capture-phone-2",
          text: "Same ridge, clearer light",
          createdAt: "2026-07-20T15:00:00.000Z",
          location: null,
          sequence: 2,
          attachments: [],
        },
      ],
    }),
  ]);

  const captures = await desktop.list();
  expect(captures.map((c) => c.id).sort()).toEqual([
    "capture-phone",
    "capture-phone-2",
  ]);
  const thread = (await desktop.listRecentThreads())[0];
  expect(thread?.revision).toBe(2);
});

test("runSyncCycle hydrates phone Threads onto desktop then accepts a desktop follow-up", async () => {
  const desktop = createMemoryCaptureStore();
  const remote = phoneThread();

  const hydrate = await runSyncCycle({
    store: desktop,
    online: true,
    threadsTransport: {
      async listThreads() {
        return [remote];
      },
    },
    captureTransport: {
      async pushCaptures() {
        return { results: [], failures: [] };
      },
    },
    enrichmentTransport: {
      async process() {
        return { results: [], jobs: [] };
      },
    },
  });

  expect(hydrate.capturesImported).toBe(1);
  expect(await desktop.list()).toHaveLength(1);

  const followUp = await desktop.commit("Desktop follow-up on the same Thread", null, {
    destination: { type: "thread", threadId: "thread-phone" },
  });
  expect(followUp.threadId).toBe("thread-phone");
  expect(followUp.status).toBe("saved_locally");

  const pushed: string[] = [];
  await runSyncCycle({
    store: desktop,
    online: true,
    threadsTransport: {
      async listThreads() {
        return [remote];
      },
    },
    captureTransport: {
      async pushCaptures(captures) {
        pushed.push(...captures.map((c) => c.id));
        return {
          results: captures.map((item) => ({
            id: item.id,
            threadId: item.threadId ?? item.id,
            sequence: item.sequence,
            status: "complete" as const,
          })),
          failures: [],
        };
      },
    },
    enrichmentTransport: {
      async process() {
        return {
          results: [
            {
              id: followUp.id,
              threadId: "thread-phone",
              status: "complete" as const,
            },
          ],
          jobs: [],
        };
      },
    },
  });

  expect(pushed).toEqual([followUp.id]);
  const threadView = await desktop.listThread("thread-phone");
  expect(threadView.captures.map((c) => c.id)).toEqual([
    "capture-phone",
    followUp.id,
  ]);
});
