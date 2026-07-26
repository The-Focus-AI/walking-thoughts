import { expect, test } from "@playwright/test";
import { summarizeDay } from "@/lib/digest/day-sheet";
import type { LocalCapture, LocalThread } from "@/lib/local-capture/types";

function capture(overrides: Partial<LocalCapture> & { id: string }): LocalCapture {
  return {
    text: "",
    createdAt: "2026-07-23T14:00:00.000Z",
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
    updatedAt: "2026-07-23T14:00:00.000Z",
    ...overrides,
  };
}

const DAY = "2026-07-23";

test("the day sheet counts what the day holds and what it left open", () => {
  const sheet = summarizeDay({
    dayKey: DAY,
    threads: [
      thread({ id: "t-call", title: "Call Windwizer", kind: "task" }),
      thread({ id: "t-bats", title: "Bat problem", kind: "task", reviewedAt: "2026-07-23T20:00:00.000Z" }),
      thread({ id: "t-pool", title: "Token pool", kind: "idea" }),
      thread({ id: "t-goldin", title: "Goldin scope", kind: null, ask: "Who is Goldin?" }),
      thread({ id: "t-new", title: "Just captured", kind: null }),
      thread({ id: "t-yesterday", title: "Yesterday's walk", kind: "place" }),
    ],
    captures: [
      capture({ id: "t-call", text: "Make sure we call windwizer today" }),
      capture({ id: "t-bats", text: "Call the guys about the bats" }),
      capture({ id: "t-pool", text: "We should build pool as a token back end" }),
      capture({ id: "t-goldin", text: "Goldin scope" }),
      capture({
        id: "t-new",
        text: "Morning coffee",
        attachments: [
          {
            id: "att-1",
            kind: "image",
            mimeType: "image/jpeg",
            fileName: "coffee.jpg",
            byteLength: 10,
            localObjectKey: "obj-1",
            syncStatus: "complete",
          },
        ],
      }),
      capture({
        id: "t-yesterday",
        text: "Stone wall in the mist",
        createdAt: "2026-07-22T10:00:00.000Z",
      }),
    ],
  });

  // Yesterday's Thread belongs to yesterday's sheet.
  expect(sheet.threadCount).toBe(5);
  expect(sheet.captureCount).toBe(5);
  expect(sheet.photoCount).toBe(1);
  expect(sheet.reviewed).toBe(1);

  // Desk order: what gets acted on leads.
  expect(sheet.kinds).toEqual([
    { kind: "task", count: 2 },
    { kind: "idea", count: 1 },
  ]);
  expect(sheet.unclassified).toBe(2);

  expect(sheet.needsWord).toEqual([
    { threadId: "t-goldin", title: "Goldin scope", ask: "Who is Goldin?" },
  ]);
  expect(sheet.toDo.map((entry) => entry.title)).toEqual([
    "Call Windwizer",
    "Bat problem",
  ]);
});

test("a day with no Captures summarizes to nothing", () => {
  const sheet = summarizeDay({ dayKey: DAY, threads: [], captures: [] });
  expect(sheet.threadCount).toBe(0);
  expect(sheet.kinds).toEqual([]);
  expect(sheet.needsWord).toEqual([]);
  expect(sheet.toRead).toEqual([]);
});

test("the day counts the reports still waiting to be read", () => {
  const threads = [
    thread({ id: "t-stone", title: "Where the patio stone came from" }),
    thread({
      id: "t-pool",
      title: "Token pool",
      reviewedAt: "2026-07-23T20:00:00.000Z",
    }),
    thread({ id: "t-call", title: "Call the yard", kind: "task" }),
  ];
  const captures = [
    capture({ id: "t-stone", text: "where did we get the stones?" }),
    capture({ id: "t-pool", text: "token back end idea" }),
    capture({ id: "t-call", text: "call the yard" }),
  ];

  const sheet = summarizeDay({
    dayKey: DAY,
    threads,
    captures,
    // Both have a page; only the unfiled one is still waiting to be read.
    threadsWithReports: new Set(["t-stone", "t-pool"]),
  });

  expect(sheet.toRead.map((entry) => entry.title)).toEqual([
    "Where the patio stone came from",
  ]);

  // A desk that has not learned which Threads have a page says nothing.
  expect(summarizeDay({ dayKey: DAY, threads, captures }).toRead).toEqual([]);
});
