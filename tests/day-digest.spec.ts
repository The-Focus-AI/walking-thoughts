import { expect, test } from "@playwright/test";
import { createFakeGatewayClient } from "@/lib/enrichment/gateway";
import { calendarDayKey } from "@/lib/local-capture/calendar-day";
import { collectDayCorpus } from "@/lib/digest/corpus";
import {
  buildDayDigestPrompt,
  DAY_DIGEST_SYSTEM_INSTRUCTION,
} from "@/lib/digest/prompt";
import { runDayDigest } from "@/lib/digest/run";
import type { DayCorpusEntry } from "@/lib/digest/types";

/**
 * Public seams:
 * - collectDayCorpus keeps Captures + Enrichments whose Capture day matches.
 * - buildDayDigestPrompt / runDayDigest ask across the whole day, not one Thread.
 */

/** Local-noon ISO so calendarDayKey stays on the intended civil day. */
function localNoonIso(year: number, month: number, day: number): string {
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

const DAY = { year: 2026, month: 7, day: 24 } as const;
const DAY_KEY = calendarDayKey(new Date(DAY.year, DAY.month - 1, DAY.day));
const DAY_HEADING = "Friday, July 24, 2026";

const ENTRIES: DayCorpusEntry[] = [
  {
    kind: "capture",
    id: "c1",
    threadId: "t1",
    threadTitle: "Stone wall",
    text: "Who farmed this high?",
    createdAt: localNoonIso(DAY.year, DAY.month, DAY.day),
  },
  {
    kind: "enrichment",
    id: "e1",
    threadId: "t1",
    threadTitle: "Stone wall",
    text: "Likely a 19th-century parcel boundary.",
    createdAt: localNoonIso(DAY.year, DAY.month, DAY.day),
    captureCreatedAt: localNoonIso(DAY.year, DAY.month, DAY.day),
  },
  {
    kind: "capture",
    id: "c2",
    threadId: "t2",
    threadTitle: "Chanterelles",
    text: "Orange mushrooms — edible?",
    createdAt: new Date(DAY.year, DAY.month - 1, DAY.day, 14, 5, 0).toISOString(),
  },
  {
    kind: "capture",
    id: "c-old",
    threadId: "t3",
    threadTitle: "Yesterday",
    text: "Should not appear",
    createdAt: localNoonIso(DAY.year, DAY.month, DAY.day - 1),
  },
];

test("collectDayCorpus keeps only entries for the requested local day", () => {
  const corpus = collectDayCorpus(ENTRIES, DAY_KEY);
  expect(corpus.map((entry) => entry.id)).toEqual(["c1", "e1", "c2"]);
});

test("buildDayDigestPrompt lists every Thread's material and the ask", () => {
  const corpus = collectDayCorpus(ENTRIES, DAY_KEY);
  const prompt = buildDayDigestPrompt({
    dayKey: DAY_KEY,
    dayHeading: DAY_HEADING,
    question: "Create a task checklist of the day",
    corpus,
  });

  expect(prompt).toContain(DAY_HEADING);
  expect(prompt).toContain("Create a task checklist of the day");
  expect(prompt).toContain("Stone wall");
  expect(prompt).toContain("Who farmed this high?");
  expect(prompt).toContain("Likely a 19th-century parcel boundary.");
  expect(prompt).toContain("Chanterelles");
  expect(prompt).not.toContain("Should not appear");
});

test("runDayDigest asks the gateway with the day system instruction", async () => {
  let seenSystem = "";
  let seenPrompt = "";
  const result = await runDayDigest(
    {
      dayKey: DAY_KEY,
      dayHeading: DAY_HEADING,
      question: "Create a task checklist of the day",
      corpus: collectDayCorpus(ENTRIES, DAY_KEY),
    },
    {
      gateway: createFakeGatewayClient(async (input) => {
        seenSystem = input.system;
        seenPrompt = input.prompt;
        return {
          text: [
            "## Checklist",
            "- [ ] Confirm the parcel boundary on the ridge",
            "- [ ] Verify the orange mushrooms before eating",
          ].join("\n"),
        };
      }),
      model: "test-model",
    },
  );

  expect(seenSystem).toBe(DAY_DIGEST_SYSTEM_INSTRUCTION);
  expect(seenPrompt).toContain("Create a task checklist of the day");
  expect(result.text).toContain("Confirm the parcel boundary");
  expect(result.model).toBe("test-model");
});

test("runDayDigest refuses an empty day without calling the gateway", async () => {
  let called = false;
  await expect(
    runDayDigest(
      {
        dayKey: DAY_KEY,
        dayHeading: DAY_HEADING,
        question: "Summarize the day",
        corpus: [],
      },
      {
        gateway: createFakeGatewayClient(async () => {
          called = true;
          return { text: "should not run" };
        }),
        model: "test-model",
      },
    ),
  ).rejects.toThrow(/no captures/i);
  expect(called).toBe(false);
});
