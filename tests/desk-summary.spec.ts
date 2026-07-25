import { expect, test } from "@playwright/test";
import {
  deskWaitingLabel,
  summarizeDesk,
  todayTally,
} from "@/lib/desk/summary";
import type { LocalCapture, LocalThread } from "@/lib/local-capture/types";

const TODAY = new Date("2026-07-25T14:00:00.000Z");

function capture(
  overrides: Partial<LocalCapture> & { id: string },
): LocalCapture {
  return {
    text: "",
    createdAt: TODAY.toISOString(),
    location: null,
    status: "complete",
    threadId: overrides.id,
    sequence: 1,
    attachments: [],
    ...overrides,
  };
}

function thread(overrides: Partial<LocalThread> & { id: string }): LocalThread {
  return {
    title: "Thread",
    revision: 1,
    updatedAt: TODAY.toISOString(),
    ...overrides,
  };
}

test("the desk summary counts what is waiting, not what exists", () => {
  const summary = summarizeDesk({
    threads: [
      thread({ id: "t-ready" }),
      thread({ id: "t-ready-2" }),
      thread({ id: "t-asked", ask: "Who is Goldin?" }),
      thread({ id: "t-stuck" }),
      thread({ id: "t-filed", reviewedAt: TODAY.toISOString() }),
      thread({ id: "t-working" }),
    ],
    captures: [
      capture({ id: "t-ready" }),
      capture({ id: "t-ready-2" }),
      capture({ id: "t-asked" }),
      capture({ id: "t-stuck", status: "needs_attention" }),
      capture({ id: "t-filed" }),
      capture({ id: "t-working", status: "enriching" }),
    ],
  });

  // Enriching work is not ready, a filed Thread is done, and an ask is its
  // own kind of waiting.
  expect(summary).toEqual({ ready: 2, needsWord: 1, attention: 1 });
});

test("the trail screen names the most pressing thing waiting at the desk", () => {
  expect(deskWaitingLabel({ ready: 0, needsWord: 0, attention: 0 })).toBeNull();
  expect(deskWaitingLabel({ ready: 1, needsWord: 0, attention: 0 })).toBe(
    "1 report ready",
  );
  expect(deskWaitingLabel({ ready: 3, needsWord: 0, attention: 0 })).toBe(
    "3 reports ready",
  );
  // A question outranks a report; stuck work outranks both.
  expect(deskWaitingLabel({ ready: 3, needsWord: 1, attention: 0 })).toBe(
    "1 Thread needs a word",
  );
  expect(deskWaitingLabel({ ready: 3, needsWord: 2, attention: 2 })).toBe(
    "2 Threads need attention",
  );
});

test("the day's tally reports today in the canonical status labels", () => {
  expect(todayTally([], TODAY)).toBe("No Captures today");

  const yesterday = new Date(TODAY);
  yesterday.setDate(yesterday.getDate() - 1);

  expect(
    todayTally(
      [
        capture({ id: "a", status: "saved_locally" }),
        capture({ id: "b", status: "enriching" }),
        capture({ id: "c", status: "enriching" }),
        capture({ id: "d", status: "needs_attention" }),
        capture({ id: "old", createdAt: yesterday.toISOString() }),
      ],
      TODAY,
    ),
  ).toBe(
    "4 Captures today · 1 Saved locally · 2 Enriching · 1 Needs attention",
  );

  expect(todayTally([capture({ id: "a" })], TODAY)).toBe(
    "1 Capture today · 1 Complete",
  );
});
