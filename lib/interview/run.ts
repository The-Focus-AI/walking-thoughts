import type { MemoryPatch, WalkerMemory, WalkerMemoryRepository } from "@/lib/memory/types";
import { getWalkerMemoryRepository } from "@/lib/memory/repository";
import { getThreadRepository } from "@/lib/sync/repository";
import type { ProjectProposal, ThreadRepository } from "@/lib/sync/types";

/**
 * How many Threads an effort must gather before the Interview raises it.
 *
 * Tunable, not a fact of the model. Against the first production corpus a
 * threshold of 1 would have made 13 Projects, ten of them holding a single
 * Thread — a second, worse copy of the Thread list. Three yields exactly the
 * efforts a walker would name by hand.
 */
export const PROJECT_PROPOSAL_THRESHOLD = 3;

export type InterviewState = {
  /**
   * Proposed Projects that have gathered enough Threads to be worth asking
   * about, most evidence first. Empty until something recurs.
   */
  proposals: ProjectProposal[];
  memories: WalkerMemory[];
  /** Full Memory Patch log, for the Changes timeline. */
  patches: MemoryPatch[];
  /** Nothing has recurred often enough to ask about. */
  complete: boolean;
};

export type InterviewVerdict =
  | { projectId: string; confirm: true; name?: string }
  | { projectId: string; confirm: false };

export type InterviewDependencies = {
  memories?: WalkerMemoryRepository;
  threads?: ThreadRepository;
  environment?: Record<string, string | undefined>;
  threshold?: number;
};

type ResolvedDependencies = {
  memories: WalkerMemoryRepository;
  threads: ThreadRepository;
  threshold: number;
};

function resolve(deps: InterviewDependencies): ResolvedDependencies {
  const environment = deps.environment ?? process.env;
  return {
    memories:
      deps.memories ?? getWalkerMemoryRepository(environment as NodeJS.ProcessEnv),
    threads: deps.threads ?? getThreadRepository(environment as NodeJS.ProcessEnv),
    threshold: deps.threshold ?? PROJECT_PROPOSAL_THRESHOLD,
  };
}

async function collect(
  userId: string,
  resolved: ResolvedDependencies,
): Promise<InterviewState> {
  const [proposals, memories, patches] = await Promise.all([
    resolved.threads.listProposedProjects(userId),
    resolved.memories.listMemories(userId),
    resolved.memories.listPatches(userId),
  ]);
  const ready = proposals.filter(
    (proposal) => proposal.threadCount >= resolved.threshold,
  );
  return {
    proposals: ready,
    memories,
    patches,
    complete: ready.length === 0,
  };
}

/**
 * What the Interview has to say right now: the Proposed Projects that have
 * recurred often enough to be worth a question, and the walker profile behind
 * the Changes timeline. A walker with nothing recurring gets an empty state,
 * which is the honest answer rather than a questionnaire.
 */
export async function readInterviewState(
  userId: string,
  deps: InterviewDependencies = {},
): Promise<InterviewState> {
  return collect(userId, resolve(deps));
}

/**
 * Records the walker's verdict on one Proposed Project. Confirming makes it a
 * Project, optionally under a better name — the name was coined from a single
 * early Thread, so renaming is the main repair path, not a nicety.
 *
 * Confirming deliberately does **not** file the Threads that accrued: knowing
 * what a pile is called is not the same as having read it, so every Thread
 * keeps its unsettled guess and Reviewed keeps meaning "I read this".
 */
export async function advanceInterview(
  userId: string,
  verdict: InterviewVerdict,
  deps: InterviewDependencies = {},
): Promise<InterviewState> {
  const resolved = resolve(deps);
  await resolved.threads.settleProject(
    userId,
    verdict.projectId,
    verdict.confirm
      ? { state: "confirmed", name: verdict.name }
      : { state: "rejected" },
  );
  return collect(userId, resolved);
}
