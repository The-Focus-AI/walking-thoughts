import { runDayDigest } from "@/lib/digest/run";
import type { DayCorpusEntry } from "@/lib/digest/types";
import { requireSyncAccess } from "@/lib/sync/access";

export const dynamic = "force-dynamic";

type DigestBody = {
  dayKey?: string;
  dayHeading?: string;
  question?: string;
  corpus?: DayCorpusEntry[];
  walkerProfile?: string | null;
};

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
