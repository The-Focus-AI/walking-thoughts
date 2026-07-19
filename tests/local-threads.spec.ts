import { expect, test } from "@playwright/test";
import {
  createDestinationSession,
  resetDestinationSession,
} from "@/lib/local-capture/destination";
import { createMemoryCaptureStore } from "@/lib/local-capture/store";
import { chronologicalThreadEntries } from "@/lib/local-capture/thread-timeline";

test.beforeEach(() => {
  resetDestinationSession();
});

test("store commit without destination still allows Inbox Captures", async () => {
  const store = createMemoryCaptureStore();
  const capture = await store.commit("Moss on the north face", null);

  expect(capture.threadId).toBeNull();
  expect(capture.sequence).toBe(1);
  await expect(store.listInbox()).resolves.toEqual([capture]);
  await expect(store.listRecentThreads()).resolves.toEqual([]);
});

test("trail session starts a Thread, sticks for the day, and rolls on a new day", async () => {
  // Local-calendar constructors avoid UTC day-boundary flakiness.
  let now = new Date(2026, 6, 18, 12, 0, 0);
  const store = createMemoryCaptureStore();
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  };
  const destination = createDestinationSession({
    now: () => now,
    storage,
  });

  expect(destination.get()).toEqual({ type: "new_thread" });

  const first = await store.commit("Cedar bark peeling", null, {
    destination: destination.get(),
  });
  destination.rememberCommit(first);

  expect(first.threadId).toEqual(expect.any(String));
  expect(first.sequence).toBe(1);
  expect(destination.get()).toEqual({
    type: "thread",
    threadId: first.threadId,
  });

  now = new Date(2026, 6, 18, 18, 10, 0);
  destination.touch();
  const correction = await store.commit(
    "Correction: it was hemlock bark",
    null,
    { destination: destination.get() },
  );
  destination.rememberCommit(correction);

  expect(correction.threadId).toBe(first.threadId);
  expect(correction.sequence).toBe(2);

  const thread = await store.listThread(first.threadId!);
  expect(thread.captures.map((capture) => capture.text)).toEqual([
    "Cedar bark peeling",
    "Correction: it was hemlock bark",
  ]);

  // Same calendar day survives a new session instance (reload).
  const reloaded = createDestinationSession({
    now: () => now,
    storage,
  });
  expect(reloaded.get()).toEqual({
    type: "thread",
    threadId: first.threadId,
  });

  now = new Date(2026, 6, 19, 9, 0, 0);
  expect(reloaded.get()).toEqual({ type: "new_thread" });
});

test("startNewThread clears the sticky Thread for the next Capture", async () => {
  const store = createMemoryCaptureStore();
  const destination = createDestinationSession({ storage: null });

  const first = await store.commit("Stream noise after rain", null, {
    destination: destination.get(),
  });
  destination.rememberCommit(first);
  expect(destination.get()).toEqual({
    type: "thread",
    threadId: first.threadId,
  });

  destination.startNewThread();
  expect(destination.get()).toEqual({ type: "new_thread" });

  const second = await store.commit("Second hike overlook", null, {
    destination: destination.get(),
  });
  destination.rememberCommit(second);
  expect(second.threadId).not.toBe(first.threadId);
});

test("chronological timeline interleaves Enrichments after their basis", () => {
  const entries = chronologicalThreadEntries(
    [
      {
        id: "c1",
        text: "one",
        createdAt: "2026-07-18T10:00:00.000Z",
        location: null,
        status: "complete",
        threadId: "t1",
        sequence: 1,
        attachments: [],
      },
      {
        id: "c2",
        text: "two",
        createdAt: "2026-07-18T11:00:00.000Z",
        location: null,
        status: "complete",
        threadId: "t1",
        sequence: 2,
        attachments: [],
      },
    ],
    [
      {
        id: "e1",
        threadId: "t1",
        text: "reply",
        model: "test-model",
        basisRevision: 1,
        basisEntryIds: ["c1"],
        targetCaptureIds: ["c1"],
        createdAt: "2026-07-18T10:05:00.000Z",
        title: null,
        sources: [],
      },
    ],
  );

  expect(entries.map((entry) => entry.kind)).toEqual([
    "capture",
    "enrichment",
    "capture",
  ]);
});
