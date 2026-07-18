import { expect, test } from "@playwright/test";
import { createMemoryCaptureStore } from "@/lib/local-capture/store";

test("memory Capture store commits text and clears the draft only after success", async () => {
  const store = createMemoryCaptureStore({ draft: "Cedar bark peeling" });

  const capture = await store.commit("Cedar bark peeling", null);

  expect(capture).toMatchObject({
    text: "Cedar bark peeling",
    location: null,
    status: "saved_locally",
    threadId: null,
    sequence: 1,
  });
  expect(capture.id.length).toBeGreaterThan(0);
  expect(Date.parse(capture.createdAt)).not.toBeNaN();
  await expect(store.getDraft()).resolves.toBe("");
  await expect(store.list()).resolves.toEqual([capture]);
  await expect(store.listInbox()).resolves.toEqual([capture]);
});

test("memory Capture store rejects empty commits without clearing the draft", async () => {
  const store = createMemoryCaptureStore({ draft: "   " });

  await expect(store.commit("   ", null)).rejects.toThrow(
    "Capture text or media is required",
  );
  await expect(store.getDraft()).resolves.toBe("   ");
  await expect(store.list()).resolves.toEqual([]);
});
