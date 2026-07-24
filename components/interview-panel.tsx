"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { ScaleBar } from "@/components/sheet";
import type { InterviewTurn } from "@/lib/interview/types";
import { revertedPatchIds } from "@/lib/memory/patches";
import type { MemoryPatch, WalkerMemory } from "@/lib/memory/types";

type InterviewStatePayload = {
  turns: InterviewTurn[];
  memories: WalkerMemory[];
  patches: MemoryPatch[];
  complete: boolean;
};

function interviewHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const testUser = process.env.NEXT_PUBLIC_SYNC_TEST_USER_ID;
  if (testUser) headers["x-walking-thoughts-test-user"] = testUser;
  return headers;
}

const OP_GLYPHS: Record<MemoryPatch["op"], string> = {
  add: "+",
  update: "~",
  remove: "−",
};

function patchTime(patch: MemoryPatch): string {
  return new Date(patch.createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function PatchSource({ patch }: { patch: MemoryPatch }) {
  if (patch.revertsPatchId) return <span>Reverted by you</span>;
  if (patch.source === "interview") return <span>Interview</span>;
  if (patch.source === "enrichment" && patch.sourceId) {
    return <Link href={`/threads/${patch.sourceId}`}>Enrichment</Link>;
  }
  if (patch.source === "enrichment") return <span>Enrichment</span>;
  return <span>You</span>;
}

/**
 * One Interview question: the machine asks in its Annotation voice — sky
 * rule, mono head — and the walker's answer prints in italic serif. The
 * you-italic / machine-upright rule is absolute (DESIGN.md).
 */
function TurnQuestion({
  turn,
  index,
}: {
  turn: InterviewTurn;
  index: number;
}) {
  return (
    <div className="interview-question">
      <header className="interview-question-head">
        <span>Question {index + 1}</span>
        <span>{turn.category}</span>
      </header>
      <p>{turn.question}</p>
    </div>
  );
}

/**
 * The Changes ledger: the append-only Memory Patch log, newest first. Every
 * way the profile can change — Interview, an Enrichment's memory_patch,
 * manual Forget — prints here as a diff with one-tap Revert.
 */
function PatchLedger({
  patches,
  onRevert,
}: {
  patches: MemoryPatch[];
  onRevert: (patchId: string) => void;
}) {
  if (patches.length === 0) {
    return (
      <p className="interview-empty">
        No changes yet. Answer a question above and the ledger begins.
      </p>
    );
  }
  const reverted = revertedPatchIds(patches);
  const newestFirst = [...patches].reverse();
  return (
    <ol className="interview-ledger" data-testid="interview-patches">
      {newestFirst.map((patch) => (
        <li
          key={patch.id}
          className={
            reverted.has(patch.id)
              ? "interview-ledger-row interview-ledger-reverted"
              : "interview-ledger-row"
          }
        >
          <span className="interview-ledger-op" aria-label={patch.op}>
            {OP_GLYPHS[patch.op]}
          </span>
          <span className="interview-ledger-body">
            {patch.op === "update" ? (
              <span className="interview-ledger-content">
                <s>{patch.before}</s> → {patch.after}
              </span>
            ) : (
              <span className="interview-ledger-content">
                {patch.after ?? patch.before}
              </span>
            )}
            <span className="interview-ledger-meta">
              <span>{patch.category}</span>
              <PatchSource patch={patch} />
              <time dateTime={patch.createdAt}>{patchTime(patch)}</time>
            </span>
          </span>
          {!reverted.has(patch.id) ? (
            <button
              type="button"
              className="interview-quiet"
              onClick={() => onRevert(patch.id)}
              aria-label={`Revert this ${patch.op}`}
            >
              Revert
            </button>
          ) : (
            <span className="interview-ledger-meta">Reverted</span>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * The Interview sheet — a desk surface (DESIGN.md): Walking Thoughts asks,
 * the walker answers, and each answer distills into Memories that tailor
 * every Enrichment. What the survey believes about its one reader stays
 * printed on this page, line by revertible line.
 */
export function InterviewPanel() {
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [memories, setMemories] = useState<WalkerMemory[]>([]);
  const [patches, setPatches] = useState<MemoryPatch[]>([]);
  const [complete, setComplete] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyState = useCallback((state: InterviewStatePayload) => {
    setTurns(state.turns);
    setMemories(state.memories);
    setPatches(state.patches ?? []);
    setComplete(state.complete);
  }, []);

  const refreshProfile = useCallback(async () => {
    const response = await fetch("/api/memories", {
      headers: interviewHeaders(),
    });
    if (!response.ok) throw new Error(String(response.status));
    const body = (await response.json()) as {
      memories: WalkerMemory[];
      patches: MemoryPatch[];
    };
    setMemories(body.memories);
    setPatches(body.patches ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/interview", {
          headers: interviewHeaders(),
        });
        if (!response.ok) throw new Error(String(response.status));
        const state = (await response.json()) as InterviewStatePayload;
        if (!active) return;
        applyState(state);
        setStarted(state.turns.length > 0);
      } catch {
        if (active) {
          setError(
            "The Interview needs a connection. It will be here when you're back in range.",
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [applyState]);

  const post = useCallback(
    async (body: { answer?: string; skip?: boolean }) => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/interview", {
          method: "POST",
          headers: { "content-type": "application/json", ...interviewHeaders() },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(String(response.status));
        applyState((await response.json()) as InterviewStatePayload);
        setStarted(true);
        setDraft("");
      } catch {
        setError(
          "That didn't reach the server. Your answer is still in the box — try again in range.",
        );
      } finally {
        setBusy(false);
      }
    },
    [applyState],
  );

  async function forget(memoryId: string) {
    setError(null);
    try {
      const response = await fetch(`/api/memories/${memoryId}`, {
        method: "DELETE",
        headers: interviewHeaders(),
      });
      if (!response.ok) throw new Error(String(response.status));
      await refreshProfile();
    } catch {
      setError("Forgetting needs a connection. Try again in range.");
    }
  }

  async function revert(patchId: string) {
    setError(null);
    try {
      const response = await fetch("/api/memories/patches", {
        method: "POST",
        headers: { "content-type": "application/json", ...interviewHeaders() },
        body: JSON.stringify({ revertPatchId: patchId }),
      });
      if (!response.ok) throw new Error(String(response.status));
      await refreshProfile();
    } catch {
      setError("Reverting needs a connection. Try again in range.");
    }
  }

  const openTurn = turns.find((turn) => turn.answer === null && !turn.skipped);
  const settledTurns = turns.filter((turn) => turn !== openTurn);

  return (
    <main className="interview-sheet" data-testid="interview-panel">
      <header className="threads-queue-header">
        <div>
          <p className="eyebrow">Provisional Survey</p>
          <h1>Interview</h1>
          <p>
            Walking Thoughts asks; your answers become Memories that tailor
            every Enrichment. Everything it believes about you is printed
            below, and any line can be reverted.
          </p>
        </div>
      </header>

      <section className="interview-section" aria-label="Interview">
        {settledTurns.map((turn, index) => (
          <div key={turn.id} className="interview-turn">
            <TurnQuestion turn={turn} index={index} />
            {turn.skipped ? (
              <p className="interview-skipped">Skipped</p>
            ) : (
              <p className="interview-answer">{turn.answer}</p>
            )}
          </div>
        ))}

        {openTurn ? (
          <div className="interview-turn" data-testid="interview-question">
            <TurnQuestion turn={openTurn} index={settledTurns.length} />
            <label className="capture-label" htmlFor="interview-answer">
              Your answer
            </label>
            <textarea
              id="interview-answer"
              className="interview-input"
              rows={3}
              value={draft}
              placeholder="In your own words."
              onChange={(event) => setDraft(event.target.value)}
              disabled={busy}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (draft.trim()) void post({ answer: draft.trim() });
                }
              }}
            />
            <div className="interview-actions">
              <button
                type="button"
                className="interview-secondary"
                onClick={() => void post({ skip: true })}
                disabled={busy}
              >
                Skip
              </button>
              <button
                type="button"
                className="interview-send"
                data-testid="interview-send"
                onClick={() => void post({ answer: draft.trim() })}
                disabled={busy || !draft.trim()}
              >
                Answer
              </button>
            </div>
            {busy ? (
              <p className="interview-status" role="status">
                Distilling — turning your answer into Memories.
              </p>
            ) : null}
          </div>
        ) : null}

        {!started && !openTurn && !complete ? (
          <div className="interview-turn">
            <p className="interview-empty">
              A few questions about who you are, where you walk, and what you
              already know. Enrichments use the answers to skip your basics
              and dig where you would dig.
            </p>
            <div className="interview-actions">
              <button
                type="button"
                className="interview-send"
                data-testid="interview-start"
                onClick={() => void post({})}
                disabled={busy}
              >
                Begin the Interview
              </button>
            </div>
          </div>
        ) : null}

        {started && !openTurn && !complete ? (
          <div className="interview-actions">
            <button
              type="button"
              className="interview-secondary"
              data-testid="interview-start"
              onClick={() => void post({})}
              disabled={busy}
            >
              Next question
            </button>
          </div>
        ) : null}

        {complete ? (
          <p className="interview-empty" data-testid="interview-complete">
            Nothing left to ask for now. The Interview resumes when there is
            something new worth asking; Enrichments keep learning meanwhile.
          </p>
        ) : null}
      </section>

      {error ? (
        <p className="capture-error" role="alert">
          {error}
        </p>
      ) : null}

      <section
        className="interview-section"
        aria-label="What Walking Thoughts remembers"
      >
        <h2 className="interview-section-title">
          What Walking Thoughts remembers
        </h2>
        {memories.length === 0 ? (
          <p className="interview-empty">
            Nothing on record yet. Answers above become Memories here.
          </p>
        ) : (
          <ul className="interview-memories" data-testid="interview-memories">
            {memories.map((memory) => (
              <li key={memory.id} className="interview-memory">
                <span className="interview-memory-category">
                  {memory.category}
                </span>
                <span className="interview-memory-content">
                  {memory.content}
                </span>
                <button
                  type="button"
                  className="interview-quiet"
                  onClick={() => void forget(memory.id)}
                  aria-label={`Forget: ${memory.content}`}
                >
                  Forget
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="interview-section"
        aria-label="Changes to what Walking Thoughts remembers"
      >
        <h2 className="interview-section-title">Changes</h2>
        <PatchLedger patches={patches} onRevert={(id) => void revert(id)} />
      </section>

      <footer className="interview-footer">
        <ScaleBar />
        <p className="interview-footer-line">
          Learned from your own words · revertible line by line
        </p>
        <p className="interview-footer-line">
          {memories.length} {memories.length === 1 ? "Memory" : "Memories"} ·{" "}
          {patches.length} {patches.length === 1 ? "change" : "changes"}
        </p>
      </footer>

      <AppNav />
    </main>
  );
}
