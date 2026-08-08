import { expect, test } from "@playwright/test";
import { collectTodos } from "@/lib/desk/todo";
import {
  buildDayDigestPrompt,
  DAY_DIGEST_SYSTEM_INSTRUCTION,
} from "@/lib/digest/prompt";
import type { LocalCapture, LocalThread } from "@/lib/local-capture/types";
import { mergeRemoteThreads } from "@/lib/sync/hydrate";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

const NS = "todo-destination-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
});

async function seedThread(
  threads: ReturnType<typeof createMemoryThreadRepository>,
  id: string,
  text: string,
) {
  await threads.upsertCaptures("user_a", [
    {
      id,
      text,
      createdAt: "2026-08-07T10:00:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: id,
      attachments: [],
    },
  ]);
  return id;
}

function localThread(overrides: Partial<LocalThread> & { id: string }): LocalThread {
  return {
    title: "Untitled",
    revision: 1,
    updatedAt: "2026-08-07T10:00:00.000Z",
    ...overrides,
  };
}

function localCapture(
  overrides: Partial<LocalCapture> & { id: string; threadId: string },
): LocalCapture {
  return {
    text: "",
    createdAt: "2026-08-07T10:00:00.000Z",
    location: null,
    status: "complete",
    sequence: 1,
    attachments: [],
    ...overrides,
  };
}

test("routing a Thread to To-do lands it on the list in the walker's words", async () => {
  const threads = createMemoryThreadRepository(NS);
  const id = await seedThread(
    threads,
    "t-todo",
    "Fix the fence gate latch before the sheep find it",
  );
  // The Enrichment names the Thread; the list must still say what the
  // walker said, not the model's title.
  await threads.updateThreadTitle!("user_a", id, "Fence maintenance");

  await threads.fileThread("user_a", id, {
    reviewedAt: "2026-08-07T18:00:00.000Z",
    route: "todo",
  });

  const listed = (await threads.listThreads("user_a")).find((t) => t.id === id);
  expect(listed?.route).toBe("todo");
  expect(listed?.todoDoneAt ?? null).toBeNull();

  const items = collectTodos(
    [
      localThread({
        id,
        title: listed!.title,
        route: "todo",
        todoDoneAt: null,
      }),
    ],
    [
      localCapture({
        id,
        threadId: id,
        text: "Fix the fence gate latch before the sheep find it",
      }),
    ],
  );
  expect(items).toHaveLength(1);
  expect(items[0].text).toBe(
    "Fix the fence gate latch before the sheep find it",
  );
  expect(items[0].dayKey).toBe("2026-08-07");
});

test("checking off round-trips and never re-files the Thread", async () => {
  const threads = createMemoryThreadRepository(NS);
  const id = await seedThread(threads, "t-check", "Order more fence wire");
  await threads.fileThread("user_a", id, {
    reviewedAt: "2026-08-07T18:00:00.000Z",
    route: "todo",
  });

  const done = await threads.setThreadTodoDone(
    "user_a",
    id,
    "2026-08-08T09:00:00.000Z",
  );
  expect(done?.todoDoneAt).toBe("2026-08-08T09:00:00.000Z");

  // The destination-surface write leaves the filing exactly as settled.
  const checked = (await threads.listThreads("user_a")).find((t) => t.id === id);
  expect(checked?.todoDoneAt).toBe("2026-08-08T09:00:00.000Z");
  expect(checked?.reviewedAt).toBe("2026-08-07T18:00:00.000Z");
  expect(checked?.route).toBe("todo");

  // Unchecking clears it back to open the same way.
  const reopened = await threads.setThreadTodoDone("user_a", id, null);
  expect(reopened?.todoDoneAt).toBeNull();

  // A Thread that does not exist reads as null, not an error.
  expect(await threads.setThreadTodoDone("user_a", "t-missing", "x")).toBeNull();
});

test("check-off state hydrates to another device the way the review does", () => {
  const merged = mergeRemoteThreads({
    localCaptures: [],
    localThreads: [
      localThread({
        id: "t-hydrate",
        title: "Order more fence wire",
        reviewedAt: "2026-08-07T18:00:00.000Z",
        route: "todo",
        todoDoneAt: null,
      }),
    ],
    remoteThreads: [
      {
        id: "t-hydrate",
        title: "Order more fence wire",
        revision: 1,
        updatedAt: "2026-08-07T10:00:00.000Z",
        reviewedAt: "2026-08-07T18:00:00.000Z",
        route: "todo",
        todoDoneAt: "2026-08-08T09:00:00.000Z",
        captures: [],
      },
    ],
  });
  expect(
    merged.threads.find((t) => t.id === "t-hydrate")?.todoDoneAt,
  ).toBe("2026-08-08T09:00:00.000Z");

  // Unchecking on the other device lands here too — the server owns it.
  const reopened = mergeRemoteThreads({
    localCaptures: [],
    localThreads: merged.threads,
    remoteThreads: [
      {
        id: "t-hydrate",
        title: "Order more fence wire",
        revision: 1,
        updatedAt: "2026-08-07T10:00:00.000Z",
        reviewedAt: "2026-08-07T18:00:00.000Z",
        route: "todo",
        todoDoneAt: null,
        captures: [],
      },
    ],
  });
  expect(
    reopened.threads.find((t) => t.id === "t-hydrate")?.todoDoneAt ?? null,
  ).toBeNull();
});

test("un-routing removes the item; so does redirecting elsewhere", () => {
  const capture = localCapture({
    id: "c-1",
    threadId: "t-unroute",
    text: "Order more fence wire",
  });
  const routed = localThread({ id: "t-unroute", route: "todo" });

  expect(collectTodos([routed], [capture])).toHaveLength(1);
  // Undo at the desk clears the route — the list is fed by the route, so
  // the item is gone by construction.
  expect(
    collectTodos([{ ...routed, route: null, reviewedAt: null }], [capture]),
  ).toHaveLength(0);
  // Redirecting to another destination removes it the same way.
  expect(
    collectTodos([{ ...routed, route: "journal" }], [capture]),
  ).toHaveLength(0);
});

test("open items sort before done ones, newest walk first", () => {
  const items = collectTodos(
    [
      localThread({
        id: "t-done",
        route: "todo",
        todoDoneAt: "2026-08-08T09:00:00.000Z",
      }),
      localThread({ id: "t-old", route: "todo" }),
      localThread({ id: "t-new", route: "todo" }),
    ],
    [
      localCapture({ id: "c-done", threadId: "t-done", text: "Done one" }),
      localCapture({
        id: "c-old",
        threadId: "t-old",
        text: "Older open one",
        createdAt: "2026-08-06T10:00:00.000Z",
      }),
      localCapture({ id: "c-new", threadId: "t-new", text: "Newer open one" }),
    ],
  );
  expect(items.map((item) => item.threadId)).toEqual([
    "t-new",
    "t-old",
    "t-done",
  ]);
});

test("the day digest checklist draws from routed to-dos, not re-derivation", () => {
  // The system instruction carries the rule on the DAY_DIGEST seam.
  expect(DAY_DIGEST_SYSTEM_INSTRUCTION).toContain("routed to-do");

  const base = {
    dayKey: "2026-08-07",
    dayHeading: "Thursday, August 7, 2026",
    question: "Create a task checklist of the day",
    corpus: [
      {
        kind: "capture" as const,
        id: "c-1",
        threadId: "t-1",
        threadTitle: "Fence maintenance",
        text: "Fix the fence gate latch before the sheep find it",
        createdAt: "2026-08-07T10:00:00.000Z",
      },
    ],
  };

  const prompt = buildDayDigestPrompt({
    ...base,
    routedTodos: [
      {
        threadId: "t-1",
        text: "Fix the fence gate latch before the sheep find it",
        done: false,
      },
      { threadId: "t-2", text: "Order more fence wire", done: true },
    ],
  });
  expect(prompt).toContain("Routed to-dos for this day");
  expect(prompt).toContain(
    "- [ ] [thread t-1] Fix the fence gate latch before the sheep find it",
  );
  expect(prompt).toContain("- [x] [thread t-2] Order more fence wire");

  // A day with none routed says so rather than inviting invention.
  const empty = buildDayDigestPrompt({ ...base, routedTodos: [] });
  expect(empty).toContain("(none routed yet)");

  // A caller that predates the To-do destination gets the old behavior.
  const absent = buildDayDigestPrompt(base);
  expect(absent).not.toContain("Routed to-dos for this day");
});
