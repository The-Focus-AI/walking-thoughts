import { enrichmentSystemAndModel, getGatewayClient } from "@/lib/enrichment/gateway";
import type { GatewayClient } from "@/lib/enrichment/types";
import { applyMemoryPatch } from "@/lib/memory/patches";
import { getWalkerMemoryRepository } from "@/lib/memory/repository";
import type {
  MemoryPatch,
  WalkerMemory,
  WalkerMemoryRepository,
} from "@/lib/memory/types";
import { extractMemoriesFromAnswer } from "./extract";
import { nextInterviewQuestion } from "./questions";
import { getInterviewRepository } from "./repository";
import type { InterviewRepository, InterviewTurn } from "./types";

export type InterviewState = {
  turns: InterviewTurn[];
  memories: WalkerMemory[];
  /** Full Memory Patch log, for the Changes timeline. */
  patches: MemoryPatch[];
  /** No open question remains and nothing further will be asked. */
  complete: boolean;
};

export type InterviewDependencies = {
  interviews?: InterviewRepository;
  memories?: WalkerMemoryRepository;
  gateway?: GatewayClient;
  model?: string;
  environment?: Record<string, string | undefined>;
  now?: () => string;
  createId?: () => string;
};

type ResolvedDependencies = Required<
  Pick<InterviewDependencies, "interviews" | "memories" | "gateway" | "model" | "now" | "createId">
>;

function resolve(deps: InterviewDependencies): ResolvedDependencies {
  const environment = deps.environment ?? process.env;
  return {
    interviews:
      deps.interviews ?? getInterviewRepository(environment as NodeJS.ProcessEnv),
    memories:
      deps.memories ?? getWalkerMemoryRepository(environment as NodeJS.ProcessEnv),
    gateway: deps.gateway ?? getGatewayClient(environment),
    model: deps.model ?? enrichmentSystemAndModel(environment).model,
    now: deps.now ?? (() => new Date().toISOString()),
    createId: deps.createId ?? (() => crypto.randomUUID()),
  };
}

function openTurn(turns: InterviewTurn[]): InterviewTurn | undefined {
  return turns.find((turn) => turn.answer === null && !turn.skipped);
}

/**
 * Read-only Interview state: the transcript, the Memories, and whether the
 * Interview still has (or could have) an open question.
 */
export async function readInterviewState(
  userId: string,
  deps: InterviewDependencies = {},
): Promise<InterviewState> {
  const resolved = resolve(deps);
  const [turns, memories, patches] = await Promise.all([
    resolved.interviews.listTurns(userId),
    resolved.memories.listMemories(userId),
    resolved.memories.listPatches(userId),
  ]);
  return { turns, memories, patches, complete: false };
}

/**
 * Advances the Interview one step: records the walker's answer (or skip) to
 * the open question, saves the Memories it teaches, then asks the next
 * question. Calling it with no answer simply ensures a question is open —
 * that is how the Interview starts.
 */
export async function advanceInterview(
  userId: string,
  input: { answer?: string; skip?: boolean },
  deps: InterviewDependencies = {},
): Promise<InterviewState> {
  const resolved = resolve(deps);
  const { interviews, memories, gateway, model, now, createId } = resolved;

  let turns = await interviews.listTurns(userId);
  const open = openTurn(turns);
  const answer = input.answer?.trim() ?? "";

  if (open && input.skip) {
    await interviews.resolveTurn(userId, open.id, {
      answer: null,
      skipped: true,
      memoryIds: [],
      answeredAt: now(),
    });
  } else if (open && answer.length > 0) {
    const existing = await memories.listMemories(userId);
    const extracted = await extractMemoriesFromAnswer({
      question: open.question,
      category: open.category,
      answer,
      existingMemories: existing,
      gateway,
      model,
    });
    const memoryIds: string[] = [];
    for (const memory of extracted) {
      const applied = await applyMemoryPatch(
        memories,
        userId,
        {
          op: "add",
          category: memory.category,
          content: memory.content,
          source: "interview",
          sourceId: open.id,
        },
        { now, createId },
      );
      if (applied.ok) memoryIds.push(applied.patch.memoryId);
    }
    await interviews.resolveTurn(userId, open.id, {
      answer,
      skipped: false,
      memoryIds,
      answeredAt: now(),
    });
  }

  turns = await interviews.listTurns(userId);
  const knownMemories = await memories.listMemories(userId);
  const patches = await memories.listPatches(userId);
  let complete = false;
  if (!openTurn(turns)) {
    const next = await nextInterviewQuestion({
      turns,
      memories: knownMemories,
      gateway,
      model,
    });
    if (next) {
      await interviews.addTurn(userId, {
        id: createId(),
        question: next.question,
        category: next.category,
        askedAt: now(),
      });
      turns = await interviews.listTurns(userId);
    } else {
      complete = true;
    }
  }

  return { turns, memories: knownMemories, patches, complete };
}
