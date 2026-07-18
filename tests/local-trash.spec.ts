import { expect, test } from "@playwright/test";
import { createMemoryCaptureStore } from "@/lib/local-capture/store";
import { expiresAtFrom } from "@/lib/sync/trash";

test("trashing a Capture hides it from ordinary review and lists a 30-day Trash record", async () => {
  const store = createMemoryCaptureStore();
  const capture = await store.commit("Hidden fern", null, {
    destination: { type: "new_thread" },
  });
  const trashedAt = "2026-07-18T09:00:00.000Z";

  const record = await store.trashCapture(capture.id, trashedAt);
  expect(record.expiresAt).toBe(expiresAtFrom(trashedAt));
  expect(await store.list()).toEqual([]);
  expect(await store.listRecentThreads()).toEqual([]);
  expect(await store.listTrash()).toEqual([
    expect.objectContaining({
      kind: "capture",
      targetId: capture.id,
      expiresAt: "2026-08-17T09:00:00.000Z",
    }),
  ]);
});

test("restore before expiry returns the Capture to ordinary review", async () => {
  const store = createMemoryCaptureStore();
  const capture = await store.commit("Restorable lichen", null, {
    destination: { type: "new_thread" },
  });
  await store.trashCapture(capture.id, "2026-07-18T09:00:00.000Z");
  await store.restoreFromTrash("capture", capture.id);

  const threads = await store.listRecentThreads();
  expect(threads).toHaveLength(1);
  const listed = await store.listThread(threads[0]!.id);
  expect(listed.captures.map((item) => item.id)).toEqual([capture.id]);
  expect(await store.listTrash()).toEqual([]);
});

test("trashing a Thread hides the whole Thread until restore", async () => {
  const store = createMemoryCaptureStore();
  const first = await store.commit("Thread root", null, {
    destination: { type: "new_thread" },
  });
  const threadId = (await store.listRecentThreads())[0]!.id;
  await store.commit("Follow-up", null, {
    destination: { type: "thread", threadId },
  });

  await store.trashThread(threadId, "2026-07-18T09:00:00.000Z");
  expect(await store.listRecentThreads()).toEqual([]);
  await expect(store.listThread(threadId)).rejects.toThrow("Thread not found");

  await store.restoreFromTrash("thread", threadId);
  const restored = await store.listThread(threadId);
  expect(restored.captures.map((item) => item.id)).toContain(first.id);
  expect(restored.captures).toHaveLength(2);
});
