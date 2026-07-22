import { expect, test } from "@playwright/test";
import { createMemoryCaptureStore } from "@/lib/local-capture/store";
import { chronologicalThreadEntries } from "@/lib/local-capture/thread-timeline";

test("a Capture without a destination starts its own Thread (ADR 0011)", async () => {
  const store = createMemoryCaptureStore();
  const capture = await store.commit("Moss on the north face", null);

  expect(capture.threadId).toEqual(expect.any(String));
  expect(capture.sequence).toBe(1);
  const threads = await store.listRecentThreads();
  expect(threads).toHaveLength(1);
  expect(threads[0].id).toBe(capture.threadId);
  expect(threads[0].title).toBe("Moss on the north face");
});

test("consecutive Captures land in separate Threads", async () => {
  const store = createMemoryCaptureStore();
  const first = await store.commit("Cedar bark peeling", null);
  const second = await store.commit("Stream noise after rain", null);

  expect(first.threadId).toEqual(expect.any(String));
  expect(second.threadId).toEqual(expect.any(String));
  expect(second.threadId).not.toBe(first.threadId);
  expect(second.sequence).toBe(1);

  const threads = await store.listRecentThreads();
  expect(threads).toHaveLength(2);
});

test("replying into an existing Thread is an explicit destination", async () => {
  const store = createMemoryCaptureStore();
  const first = await store.commit("Cedar bark peeling", null);

  const reply = await store.commit("Correction: it was hemlock bark", null, {
    destination: { type: "thread", threadId: first.threadId! },
  });

  expect(reply.threadId).toBe(first.threadId);
  expect(reply.sequence).toBe(2);

  const thread = await store.listThread(first.threadId!);
  expect(thread.captures.map((capture) => capture.text)).toEqual([
    "Cedar bark peeling",
    "Correction: it was hemlock bark",
  ]);
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
