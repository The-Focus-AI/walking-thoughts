import { expect, test } from "@playwright/test";
import { createFakeGatewayClient } from "@/lib/enrichment/gateway";
import { parseMemoryLines } from "@/lib/interview/extract";
import {
  createMemoryInterviewRepository,
  resetMemoryInterviewRepository,
} from "@/lib/interview/memory-repository";
import {
  MAX_INTERVIEW_TURNS,
  SEED_QUESTIONS,
  parseFollowUpQuestion,
} from "@/lib/interview/questions";
import { advanceInterview, readInterviewState } from "@/lib/interview/run";
import {
  createMemoryWalkerMemoryRepository,
  resetMemoryWalkerMemoryRepository,
} from "@/lib/memory/memory-repository";

const NS = "interview-tests";

let idCounter = 0;

function dependencies(gatewayText?: (system: string) => string) {
  idCounter = 0;
  return {
    interviews: createMemoryInterviewRepository(NS),
    memories: createMemoryWalkerMemoryRepository(NS),
    gateway: createFakeGatewayClient(async (input) => ({
      text: gatewayText ? gatewayText(input.system) : "no memory lines here",
    })),
    model: "test-model",
    now: () => "2026-07-23T10:00:00.000Z",
    createId: () => `id-${++idCounter}`,
  };
}

test.beforeEach(() => {
  resetMemoryInterviewRepository(NS);
  resetMemoryWalkerMemoryRepository(NS);
});

test("parseMemoryLines keeps valid categories, caps at five, ignores junk", () => {
  const parsed = parseMemoryLines(
    [
      "Some preamble the model added",
      "MEMORY[interest]: Loves birding",
      "MEMORY[unknown]: Should be dropped",
      "MEMORY[place]:   Walks in the Columbia Gorge  ",
      "MEMORY[expertise]: Knows conifers well",
      "MEMORY[identity]: A retired teacher",
      "MEMORY[preference]: Prefers deep dives",
      "MEMORY[interest]: A sixth fact past the cap",
    ].join("\n"),
  );
  expect(parsed).toHaveLength(5);
  expect(parsed[0]).toEqual({ category: "interest", content: "Loves birding" });
  expect(parsed[1]).toEqual({
    category: "place",
    content: "Walks in the Columbia Gorge",
  });
});

test("parseFollowUpQuestion reads QUESTION lines and rejects everything else", () => {
  expect(
    parseFollowUpQuestion("QUESTION[interest]: Which raptors so far?"),
  ).toEqual({ category: "interest", question: "Which raptors so far?" });
  expect(parseFollowUpQuestion("DONE")).toBeNull();
  expect(parseFollowUpQuestion("QUESTION[nope]: bad category")).toBeNull();
});

test("the Interview opens with the first seed question", async () => {
  const deps = dependencies();
  const state = await advanceInterview("user_a", {}, deps);

  expect(state.turns).toHaveLength(1);
  expect(state.turns[0].question).toBe(SEED_QUESTIONS[0].question);
  expect(state.turns[0].answer).toBeNull();
  expect(state.complete).toBe(false);
});

test("answering extracts Memories via the gateway and asks the next seed", async () => {
  const deps = dependencies((system) =>
    system.includes("distill")
      ? "MEMORY[identity]: A field biologist who walks daily\nMEMORY[interest]: Tracks owl territories"
      : "no question",
  );
  await advanceInterview("user_a", {}, deps);
  const state = await advanceInterview(
    "user_a",
    { answer: "I'm a field biologist, out every day tracking owls." },
    deps,
  );

  expect(state.memories.map((memory) => memory.content)).toEqual([
    "A field biologist who walks daily",
    "Tracks owl territories",
  ]);
  expect(state.memories.every((memory) => memory.source === "interview")).toBe(
    true,
  );

  const answered = state.turns[0];
  expect(answered.answer).toContain("field biologist");
  expect(answered.memoryIds).toHaveLength(2);
  // Memories point back to the turn that taught them.
  expect(state.memories.every((memory) => memory.sourceId === answered.id)).toBe(
    true,
  );

  const open = state.turns.find((turn) => turn.answer === null);
  expect(open?.question).toBe(SEED_QUESTIONS[1].question);
});

test("an answer the model can't distill is kept whole under the question's category", async () => {
  const deps = dependencies(() => "no structured output at all");
  await advanceInterview("user_a", {}, deps);
  const state = await advanceInterview(
    "user_a",
    { answer: "Mostly the woods behind my house." },
    deps,
  );

  expect(state.memories).toHaveLength(1);
  expect(state.memories[0].content).toBe("Mostly the woods behind my house.");
  expect(state.memories[0].category).toBe(SEED_QUESTIONS[0].category);
});

test("skipping resolves the turn without learning anything", async () => {
  const deps = dependencies();
  await advanceInterview("user_a", {}, deps);
  const state = await advanceInterview("user_a", { skip: true }, deps);

  expect(state.memories).toHaveLength(0);
  expect(state.turns[0].skipped).toBe(true);
  const open = state.turns.find((turn) => turn.answer === null && !turn.skipped);
  expect(open?.question).toBe(SEED_QUESTIONS[1].question);
});

test("after the seeds, gateway follow-ups continue until DONE completes the Interview", async () => {
  const deps = dependencies((system) =>
    system.includes("distill")
      ? "NONE"
      : "QUESTION[interest]: Which trail surprised you most this year?",
  );

  let state = await advanceInterview("user_a", {}, deps);
  for (let i = 0; i < SEED_QUESTIONS.length; i += 1) {
    state = await advanceInterview("user_a", { answer: `Answer ${i}` }, deps);
  }
  const followUp = state.turns.find((turn) => turn.answer === null);
  expect(followUp?.question).toBe(
    "Which trail surprised you most this year?",
  );

  const doneDeps = {
    ...deps,
    gateway: createFakeGatewayClient(async (input) => ({
      text: input.system.includes("distill") ? "NONE" : "DONE",
    })),
  };
  const finished = await advanceInterview(
    "user_a",
    { answer: "The ridge loop" },
    doneDeps,
  );
  expect(finished.complete).toBe(true);
  expect(
    finished.turns.filter((turn) => turn.answer === null && !turn.skipped),
  ).toHaveLength(0);
});

test("the Interview never exceeds the turn cap", async () => {
  const deps = dependencies((system) =>
    system.includes("distill")
      ? "NONE"
      : "QUESTION[interest]: Another follow-up?",
  );
  let state = await advanceInterview("user_a", {}, deps);
  for (let i = 0; i < MAX_INTERVIEW_TURNS + 3; i += 1) {
    state = await advanceInterview("user_a", { answer: `Answer ${i}` }, deps);
  }
  expect(state.turns.length).toBeLessThanOrEqual(MAX_INTERVIEW_TURNS);
  expect(state.complete).toBe(true);
});

test("readInterviewState is read-only", async () => {
  const deps = dependencies();
  const before = await readInterviewState("user_a", deps);
  expect(before.turns).toHaveLength(0);
  const after = await readInterviewState("user_a", deps);
  expect(after.turns).toHaveLength(0);
});
