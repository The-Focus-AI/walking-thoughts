"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AccountExport } from "@/components/account-export";
import { AppNav } from "@/components/app-nav";
import { DataHandlingDisclosure } from "@/components/data-handling-disclosure";
import { ScaleBar } from "@/components/sheet";
import { revertedPatchIds } from "@/lib/memory/patches";
import { fetchWithTimeout, MODEL_TIMEOUT_MS } from "@/lib/net/timeout";
import type { MemoryPatch, WalkerMemory } from "@/lib/memory/types";
import type { ProjectProposal } from "@/lib/sync/types";

type InterviewStatePayload = {
  proposals: ProjectProposal[];
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
 * The one question no Thread can answer, asked in the machine's Annotation
 * voice — sky rule, mono head. The evidence is the walker's own walks, so
 * the Threads print as the survey log prints them (DESIGN.md).
 */
function ProposalQuestion({ proposal }: { proposal: ProjectProposal }) {
  return (
    <div className="interview-question">
      <header className="interview-question-head">
        <span>Recurring</span>
        <span>
          {proposal.threadCount}{" "}
          {proposal.threadCount === 1 ? "Thread" : "Threads"}
        </span>
      </header>
      <p>
        {proposal.threadCount} Threads keep circling the same thing. Is that a
        Project, and is this what you call it?
      </p>
      <ul className="interview-proposal-threads">
        {proposal.threads.map((thread) => (
          <li key={thread.id}>
            <Link href={`/threads/${thread.id}`}>{thread.title}</Link>
          </li>
        ))}
      </ul>
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
 * The Interview sheet — a desk surface (DESIGN.md). It is the one place that
 * sees across Threads, so it asks the one question no Thread can: this keeps
 * coming back, what do you call it? What the survey believes about its one
 * reader stays printed below, line by revertible line.
 */
export function InterviewPanel() {
  const [proposals, setProposals] = useState<ProjectProposal[]>([]);
  const [memories, setMemories] = useState<WalkerMemory[]>([]);
  const [patches, setPatches] = useState<MemoryPatch[]>([]);
  const [complete, setComplete] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyState = useCallback((state: InterviewStatePayload) => {
    setProposals(state.proposals ?? []);
    setMemories(state.memories);
    setPatches(state.patches ?? []);
    setComplete(state.complete);
  }, []);

  const refreshProfile = useCallback(async () => {
    const response = await fetchWithTimeout("/api/memories", {
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
        const response = await fetchWithTimeout("/api/interview", {
          headers: interviewHeaders(),
        });
        if (!response.ok) throw new Error(String(response.status));
        const state = (await response.json()) as InterviewStatePayload;
        if (!active) return;
        applyState(state);
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
    async (body: { projectId: string; confirm: boolean; name?: string }) => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetchWithTimeout(
          "/api/interview",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...interviewHeaders(),
            },
            body: JSON.stringify(body),
          },
          MODEL_TIMEOUT_MS,
        );
        if (!response.ok) throw new Error(String(response.status));
        applyState((await response.json()) as InterviewStatePayload);
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
      const response = await fetchWithTimeout(`/api/memories/${memoryId}`, {
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
      const response = await fetchWithTimeout("/api/memories/patches", {
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

  const open = proposals[0] ?? null;

  return (
    <main className="interview-sheet" data-testid="interview-panel">
      <header className="threads-queue-header">
        <div>
          <p className="eyebrow">Provisional Survey</p>
          <h1>You</h1>
          <p>
            Enrichments learn you from your own Captures. When the same effort
            keeps coming back across walks, Walking Thoughts asks what to call
            it. Everything it believes is printed below, and any line can be
            reverted.
          </p>
        </div>
      </header>

      <section className="interview-section" aria-label="Interview">
        <h2 className="interview-section-title">Interview</h2>

        {open ? (
          <div className="interview-turn" data-testid="interview-question">
            <ProposalQuestion proposal={open} />
            <label className="capture-label" htmlFor="interview-answer">
              Project name
            </label>
            <input
              id="interview-answer"
              className="interview-input"
              value={draft || open.name}
              onChange={(event) => setDraft(event.target.value)}
              disabled={busy}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                const name = (draft || open.name).trim();
                if (name) {
                  void post({ projectId: open.id, confirm: true, name });
                }
              }}
            />
            <div className="interview-actions">
              <button
                type="button"
                className="interview-secondary"
                data-testid="interview-reject"
                onClick={() =>
                  void post({ projectId: open.id, confirm: false })
                }
                disabled={busy}
              >
                Not a Project
              </button>
              <button
                type="button"
                className="interview-send"
                data-testid="interview-send"
                onClick={() =>
                  void post({
                    projectId: open.id,
                    confirm: true,
                    name: (draft || open.name).trim(),
                  })
                }
                disabled={busy || !(draft || open.name).trim()}
              >
                It&rsquo;s a Project
              </button>
            </div>
            {busy ? (
              <p className="interview-status" role="status">
                Filing — making it a Project.
              </p>
            ) : null}
          </div>
        ) : null}

        {proposals.length > 1 ? (
          <p className="interview-empty">
            {proposals.length - 1} more waiting after this one.
          </p>
        ) : null}

        {complete ? (
          <p className="interview-empty" data-testid="interview-complete">
            Nothing to ask yet. Walking Thoughts asks once the same effort has
            come back across a few walks; Enrichments keep learning meanwhile.
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

      <details className="trail-account">
        <summary>Account &amp; data handling</summary>
        <AccountExport />
        <DataHandlingDisclosure />
      </details>

      <footer className="interview-footer">
        <ScaleBar />
        <p className="interview-footer-line">
          Learned from your own words · revertible line by line
        </p>
        <p className="interview-footer-line">
          Local first · Private cloud media · no end-to-end encryption claim
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
