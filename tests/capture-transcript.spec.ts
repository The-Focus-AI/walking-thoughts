import { expect, test } from "@playwright/test";
import { buildDayDigestPrompt } from "@/lib/digest/prompt";
import { captureWords } from "@/lib/local-capture/types";
import { collectTodos } from "@/lib/desk/todo";
import { mergeRemoteThreads } from "@/lib/sync/hydrate";
import {
  createMemoryEnrichmentRepository,
  resetMemoryEnrichmentRepository,
} from "@/lib/enrichment/memory-repository";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

/**
 * A spoken Capture carries no typed text. Its transcript used to live only
 * on the Enrichment, so every surface that shows "the walker's own words"
 * read an empty string — the day digest was handed a corpus of blanks and
 * produced nothing worth reading. These cover the seam that fixes it: the
 * transcript lands on the Capture, and each reader falls back to it.
 */

const NS = "capture-transcript-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryEnrichmentRepository(NS);
});

const SPOKEN = "For Welton — pull scheduling into its own worker.";

async function seedSpokenCapture(
  threads: ReturnType<typeof createMemoryThreadRepository>,
  id = "c-audio",
) {
  await threads.upsertCaptures("user_a", [
    {
      id,
      // A recording: the walker typed nothing.
      text: "",
      createdAt: "2026-08-08T06:41:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: id,
      attachments: [
        {
          id: "a-1",
          kind: "audio",
          mimeType: "audio/mp4",
          fileName: "capture.m4a",
        },
      ],
    },
  ]);
  return id;
}

test("captureWords speaks for a recording and never overrides typing", () => {
  expect(captureWords({ text: "", transcript: SPOKEN })).toBe(SPOKEN);
  expect(captureWords({ text: "   ", transcript: SPOKEN })).toBe(SPOKEN);
  // The walker's own typing always wins — a transcript never overwrites it.
  expect(captureWords({ text: "typed", transcript: SPOKEN })).toBe("typed");
  // Nothing said and nothing typed reads as empty, not as "undefined".
  expect(captureWords({ text: "", transcript: null })).toBe("");
  expect(captureWords({ text: "" })).toBe("");
});

test("a transcript recorded during enrichment lands on the Capture", async () => {
  const threads = createMemoryThreadRepository(NS);
  const id = await seedSpokenCapture(threads);

  await threads.recordCaptureTranscripts("user_a", [
    { captureId: id, text: SPOKEN },
  ]);

  const listed = await threads.listThreads("user_a");
  const capture = listed.flatMap((thread) => thread.captures).find((c) => c.id === id);
  expect(capture?.transcript).toBe(SPOKEN);
  expect(captureWords(capture!)).toBe(SPOKEN);
});

test("recording transcripts is idempotent and ignores empty ones", async () => {
  const threads = createMemoryThreadRepository(NS);
  const id = await seedSpokenCapture(threads);

  await threads.recordCaptureTranscripts("user_a", [
    { captureId: id, text: SPOKEN },
  ]);
  // Re-transcribing the same audio must not corrupt what is there, and a
  // blank result must never erase a good transcript.
  await threads.recordCaptureTranscripts("user_a", [
    { captureId: id, text: SPOKEN },
    { captureId: id, text: "   " },
  ]);

  const listed = await threads.listThreads("user_a");
  const capture = listed.flatMap((t) => t.captures).find((c) => c.id === id);
  expect(capture?.transcript).toBe(SPOKEN);
});

test("hydration gives the transcript to a Capture the device already holds", () => {
  // The Capture synced before it was transcribed, which is always the order:
  // the Enrichment writes the transcript afterwards. Without adoption here,
  // the device that recorded the walk is the one that never sees the words.
  const merged = mergeRemoteThreads({
    localCaptures: [
      {
        id: "c-audio",
        text: "",
        createdAt: "2026-08-08T06:41:00.000Z",
        location: null,
        status: "complete",
        threadId: "t-1",
        sequence: 1,
        attachments: [],
        transcript: null,
      },
    ],
    localThreads: [
      {
        id: "t-1",
        title: "Morning",
        revision: 1,
        updatedAt: "2026-08-08T06:41:00.000Z",
      },
    ],
    remoteThreads: [
      {
        id: "t-1",
        title: "Morning",
        revision: 1,
        updatedAt: "2026-08-08T06:41:00.000Z",
        captures: [
          {
            id: "c-audio",
            text: "",
            createdAt: "2026-08-08T06:41:00.000Z",
            location: null,
            sequence: 1,
            attachments: [],
            transcript: SPOKEN,
          },
        ],
      },
    ],
  });

  expect(merged.captures.find((c) => c.id === "c-audio")?.transcript).toBe(SPOKEN);
});

test("the day digest corpus carries what was said, not a blank line", () => {
  // The exact failure: a day of recordings reached the model as empty
  // capture entries, so it had nothing to digest.
  const prompt = buildDayDigestPrompt({
    dayKey: "2026-08-08",
    dayHeading: "Friday, August 8",
    question: "Summarize the day",
    corpus: [
      {
        kind: "capture",
        id: "c-audio",
        threadId: "t-1",
        threadTitle: "Morning",
        text: captureWords({ text: "", transcript: SPOKEN }),
        createdAt: "2026-08-08T06:41:00.000Z",
      },
    ],
  });

  expect(prompt).toContain(SPOKEN);
});

test("a Thread's frozen history carries what earlier recordings said", async () => {
  // The job re-sends audio bytes only for the Captures it targets. Every
  // *earlier* recording on the Thread reaches the model through this history
  // and nowhere else — blank there means the report is written as though the
  // walk had been silent until the last thought.
  const threads = createMemoryThreadRepository(NS);
  const id = await seedSpokenCapture(threads);
  await threads.recordCaptureTranscripts("user_a", [
    { captureId: id, text: SPOKEN },
  ]);

  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const pending = await enrichment.listPendingThreads("user_a");
  const entry = pending
    .flatMap((thread) => thread.entries)
    .find((candidate) => candidate.id === id);

  expect(entry?.text).toBe(SPOKEN);
});

test("the To-do list shows a spoken task in the walker's own words", () => {
  const todos = collectTodos(
    [
      {
        id: "t-1",
        title: "Call Windwizer today",
        revision: 1,
        updatedAt: "2026-08-08T06:52:00.000Z",
        route: "todo",
        reviewedAt: "2026-08-08T09:00:00.000Z",
      },
    ],
    [
      {
        id: "c-audio",
        text: "",
        createdAt: "2026-08-08T06:52:00.000Z",
        location: null,
        status: "complete",
        threadId: "t-1",
        sequence: 1,
        attachments: [],
        transcript: "Make sure we call Windwizer today about the estimate.",
      },
    ],
  );

  expect(todos[0]?.text).toBe(
    "Make sure we call Windwizer today about the estimate.",
  );
});
