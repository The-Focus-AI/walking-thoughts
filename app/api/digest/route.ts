import { runDayDigest } from "@/lib/digest/run";
import type {
  DayChatTurn,
  DayCorpusEntry,
  DayRoutedTodo,
} from "@/lib/digest/types";
import { requireSyncAccess } from "@/lib/sync/access";

export const dynamic = "force-dynamic";

type DigestBody = {
  dayKey?: string;
  dayHeading?: string;
  question?: string;
  corpus?: DayCorpusEntry[];
  walkerProfile?: string | null;
  history?: DayChatTurn[];
  routedTodos?: DayRoutedTodo[];
};

/**
 * Keep only well-formed routed to-dos, and keep the field's absence
 * distinct from an empty list: absent = the client predates the To-do
 * destination (derive as before); [] = the walker routed none that day.
 */
function sanitizeRoutedTodos(routedTodos: unknown): DayRoutedTodo[] | undefined {
  if (!Array.isArray(routedTodos)) return undefined;
  return routedTodos
    .filter(
      (todo): todo is DayRoutedTodo =>
        typeof todo === "object" &&
        todo !== null &&
        typeof (todo as DayRoutedTodo).threadId === "string" &&
        typeof (todo as DayRoutedTodo).text === "string" &&
        (todo as DayRoutedTodo).text.trim().length > 0,
    )
    .map((todo) => ({
      threadId: todo.threadId,
      text: todo.text,
      done: todo.done === true,
    }));
}

/** Most recent turns of the ongoing chat sent back for context. */
const HISTORY_TURN_LIMIT = 24;
const HISTORY_TURN_CHARS = 4000;

function sanitizeHistory(history: unknown): DayChatTurn[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (turn): turn is DayChatTurn =>
        typeof turn === "object" &&
        turn !== null &&
        ((turn as DayChatTurn).role === "walker" ||
          (turn as DayChatTurn).role === "digest") &&
        typeof (turn as DayChatTurn).text === "string" &&
        (turn as DayChatTurn).text.trim().length > 0,
    )
    .slice(-HISTORY_TURN_LIMIT)
    .map((turn) => ({
      role: turn.role,
      text: turn.text.slice(0, HISTORY_TURN_CHARS),
    }));
}

/**
 * Cross-Thread day digest: the client assembles today's local Captures and
 * Enrichments; the server asks the Enrichment gateway across that corpus.
 */
export async function POST(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  let body: DigestBody;
  try {
    body = (await request.json()) as DigestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const dayKey = typeof body.dayKey === "string" ? body.dayKey.trim() : "";
  const dayHeading =
    typeof body.dayHeading === "string" ? body.dayHeading.trim() : dayKey;
  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  const corpus = Array.isArray(body.corpus) ? body.corpus : [];

  if (!dayKey || !question) {
    return Response.json(
      { error: "dayKey and question are required." },
      { status: 400 },
    );
  }

  try {
    const result = await runDayDigest(
      {
        dayKey,
        dayHeading,
        question,
        corpus,
        walkerProfile:
          typeof body.walkerProfile === "string" ? body.walkerProfile : null,
        history: sanitizeHistory(body.history),
        routedTodos: sanitizeRoutedTodos(body.routedTodos),
      },
      { userId: access.userId },
    );
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Digest could not run.";
    const status = /no captures|required/i.test(message) ? 400 : 502;
    return Response.json({ error: message }, { status });
  }
}
