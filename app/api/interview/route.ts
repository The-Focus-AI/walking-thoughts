import { advanceInterview, readInterviewState } from "@/lib/interview/run";
import { requireSyncAccess } from "@/lib/sync/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  const state = await readInterviewState(access.userId);
  return Response.json(state);
}

export async function POST(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  let answer: string | undefined;
  let skip = false;
  try {
    const body = (await request.json()) as { answer?: string; skip?: boolean };
    if (typeof body.answer === "string") answer = body.answer;
    skip = Boolean(body.skip);
  } catch {
    // empty body just opens (or re-opens) the next question
  }

  const state = await advanceInterview(access.userId, { answer, skip });
  return Response.json(state);
}
