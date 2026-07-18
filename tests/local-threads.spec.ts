import { expect, test } from "@playwright/test";
import { createDestinationSession } from "@/lib/local-capture/destination";
import { createMemoryCaptureStore } from "@/lib/local-capture/store";

test("new Captures default to the Inbox without organization", async () => {
  const store = createMemoryCaptureStore();
  const capture = await store.commit("Moss on the north face", null);

  expect(capture.threadId).toBeNull();
  expect(capture.sequence).toBe(1);
  await expect(store.listInbox()).resolves.toEqual([capture]);
  await expect(store.listRecentThreads()).resolves.toEqual([]);
});

test("destination sticks to a Thread, resets after inactivity, and Threads stay append-only", async () => {
  let now = new Date("2026-07-18T12:00:00.000Z");
  const store = createMemoryCaptureStore();
  const destination = createDestinationSession({
    now: () => now,
    inactivityMs: 30 * 60 * 1000,
  });

  expect(destination.get()).toEqual({ type: "inbox" });

  destination.set({ type: "new_thread" });
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

  now = new Date("2026-07-18T12:10:00.000Z");
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
  expect(thread.thread.revision).toBe(2);
  expect(thread.captures.map((capture) => capture.text)).toEqual([
    "Cedar bark peeling",
    "Correction: it was hemlock bark",
  ]);
  expect(thread.captures.map((capture) => capture.sequence)).toEqual([1, 2]);

  // Committed Captures are immutable — history only grows by append.
  expect(thread.captures[0]?.text).toBe("Cedar bark peeling");
  expect(Object.keys(store)).not.toContain("updateCapture");
  expect(thread.captures).toHaveLength(2);

  now = new Date("2026-07-18T12:45:00.000Z");
  expect(destination.get()).toEqual({ type: "inbox" });

  const recent = await store.listRecentThreads();
  expect(recent).toHaveLength(1);
  expect(recent[0]).toMatchObject({
    id: first.threadId,
    title: "Cedar bark peeling",
    revision: 2,
  });
});

test("explicit destination change returns the composer to the Inbox", async () => {
  const store = createMemoryCaptureStore();
  const destination = createDestinationSession();

  destination.set({ type: "new_thread" });
  const first = await store.commit("Stream noise after rain", null, {
    destination: destination.get(),
  });
  destination.rememberCommit(first);

  destination.set({ type: "inbox" });
  expect(destination.get()).toEqual({ type: "inbox" });

  const inboxCapture = await store.commit("Unrelated bird call", null, {
    destination: destination.get(),
  });
  expect(inboxCapture.threadId).toBeNull();
  await expect(store.listInbox()).resolves.toEqual([inboxCapture]);
});
