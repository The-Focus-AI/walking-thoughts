import type { GatewayClient } from "@/lib/enrichment/types";
import { isMemoryCategory, type MemoryCategory, type WalkerMemory } from "@/lib/memory/types";
import type { InterviewTurn } from "./types";

export type InterviewQuestion = {
  /** Stable id so a seed question is asked at most once. */
  id: string;
  category: MemoryCategory;
  question: string;
};

/**
 * Opening questions every walker gets, in order. Once these run out the
 * gateway model proposes follow-ups grounded in earlier answers.
 */
export const SEED_QUESTIONS: InterviewQuestion[] = [
  {
    id: "seed-identity",
    category: "identity",
    question:
      "Who are you when you're out walking? A sentence or two about yourself helps your trail reports speak to you.",
  },
  {
    id: "seed-place",
    category: "place",
    question:
      "Where do you usually walk — which region, terrain, or trails do you keep returning to?",
  },
  {
    id: "seed-interest",
    category: "interest",
    question:
      "What tends to catch your attention out there — birds, plants, geology, weather, history, something else?",
  },
  {
    id: "seed-expertise",
    category: "expertise",
    question:
      "What do you already know deeply? Your reports can skip the basics in those areas.",
  },
  {
    id: "seed-preference",
    category: "preference",
    question:
      "How do you like your Enrichment reports — quick identifications, deep dives, comparisons with what you've seen before?",
  },
];

/** Interview length cap: seeds plus a handful of model follow-ups. */
export const MAX_INTERVIEW_TURNS = 12;

const FOLLOW_UP_SYSTEM = [
  "You are Walking Thoughts, interviewing a walker to learn durable facts that will tailor their future trail research reports.",
  "Given what is already known and the interview so far, ask exactly one short, warm, concrete follow-up question that would surface something new and durable about the walker.",
  "Respond with a single line in the form `QUESTION[category]: ...` where category is one of identity, place, interest, expertise, preference.",
  "If nothing genuinely useful is left to ask, respond with the single word DONE.",
].join(" ");

export function parseFollowUpQuestion(
  raw: string,
): { category: MemoryCategory; question: string } | null {
  const match = raw.match(/QUESTION\[([a-z]+)\]:\s*(.+)/i);
  if (!match) return null;
  const category = match[1].toLowerCase();
  const question = match[2].trim().slice(0, 300);
  if (!isMemoryCategory(category) || question.length === 0) return null;
  return { category, question };
}

function transcriptBlock(turns: InterviewTurn[]): string {
  if (turns.length === 0) return "(no questions asked yet)";
  return turns
    .map((turn) => {
      const answer = turn.skipped
        ? "(skipped)"
        : (turn.answer ?? "(awaiting answer)");
      return `Q: ${turn.question}\nA: ${answer}`;
    })
    .join("\n");
}

function memoriesBlock(memories: WalkerMemory[]): string {
  if (memories.length === 0) return "(nothing yet)";
  return memories
    .map((memory) => `- (${memory.category}) ${memory.content}`)
    .join("\n");
}

/**
 * Picks the next Interview question: the first unasked seed, then gateway
 * follow-ups grounded in the transcript. Returns null when the Interview is
 * complete (turn cap reached, or the model has nothing left to ask).
 */
export async function nextInterviewQuestion(input: {
  turns: InterviewTurn[];
  memories: WalkerMemory[];
  gateway: GatewayClient;
  model: string;
}): Promise<{ category: MemoryCategory; question: string } | null> {
  if (input.turns.length >= MAX_INTERVIEW_TURNS) return null;

  const askedQuestions = new Set(input.turns.map((turn) => turn.question));
  const seed = SEED_QUESTIONS.find(
    (candidate) => !askedQuestions.has(candidate.question),
  );
  if (seed) return { category: seed.category, question: seed.question };

  const prompt = [
    "Already-remembered facts about this walker:",
    memoriesBlock(input.memories),
    "Interview so far:",
    transcriptBlock(input.turns),
    "Ask the next follow-up question, or reply DONE.",
  ].join("\n\n");

  const generation = await input.gateway.generate({
    model: input.model,
    system: FOLLOW_UP_SYSTEM,
    prompt,
    requestTitle: false,
    media: [],
  });
  return parseFollowUpQuestion(generation.text);
}
