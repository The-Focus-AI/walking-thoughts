"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppNav } from "@/components/app-nav";
import type { InterviewTurn } from "@/lib/interview/types";
import type { WalkerMemory } from "@/lib/memory/types";

type InterviewStatePayload = {
  turns: InterviewTurn[];
  memories: WalkerMemory[];
  complete: boolean;
};

function interviewHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const testUser = process.env.NEXT_PUBLIC_SYNC_TEST_USER_ID;
  if (testUser) headers["x-walking-thoughts-test-user"] = testUser;
  return headers;
}

const CATEGORY_LABELS: Record<WalkerMemory["category"], string> = {
  identity: "About you",
  place: "Where you walk",
  interest: "Interests",
  expertise: "What you know",
  preference: "Report style",
};

function MemoryList({
  memories,
  onForget,
}: {
  memories: WalkerMemory[];
  onForget: (memoryId: string) => void;
}) {
  if (memories.length === 0) {
    return (
      <p className="interview-memories-empty">
        Nothing remembered yet. Answers below become Memories that tailor
        every future Enrichment.
      </p>
    );
  }
  return (
    <ul className="interview-memories" data-testid="interview-memories">
      {memories.map((memory) => (
        <li key={memory.id} className="interview-memory">
          <span className="interview-memory-category">
            {CATEGORY_LABELS[memory.category]}
          </span>
          <span className="interview-memory-content">{memory.content}</span>
          <button
            type="button"
            className="interview-memory-forget"
            onClick={() => onForget(memory.id)}
            aria-label={`Forget: ${memory.content}`}
          >
            Forget
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The Interview: Walking Thoughts asks about the walker, each answer is
 * distilled into Memories, and every Memory stays visible and forgettable.
 * Memories feed the walker profile that tailors future Enrichments.
 */
export function InterviewPanel() {
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [memories, setMemories] = useState<WalkerMemory[]>([]);
  const [complete, setComplete] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyState = useCallback((state: InterviewStatePayload) => {
    setTurns(state.turns);
    setMemories(state.memories);
    setComplete(state.complete);
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
        if (active) setError("Could not load the Interview — check the connection");
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
        setError("Could not reach the Interview — check the connection");
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
      setMemories((current) =>
        current.filter((memory) => memory.id !== memoryId),
      );
    } catch {
      setError("Could not forget that Memory — check the connection");
    }
  }

  const openTurn = turns.find((turn) => turn.answer === null && !turn.skipped);
  const settledTurns = turns.filter((turn) => turn !== openTurn);

  return (
    <div className="thread-chat interview-panel" data-testid="interview-panel">
      <header className="thread-chat-header">
        <div>
          <Link className="topbar-link" href="/">
            ← Capture
          </Link>
          <h1>Interview</h1>
          <p className="thread-chat-sub">
            A short conversation so Enrichments know who they&apos;re
            researching for. Everything learned is listed below and can be
            forgotten.
          </p>
        </div>
      </header>

      <div
        className="thread-chat-log"
        role="log"
        aria-label="Interview"
        aria-live="polite"
      >
        {settledTurns.map((turn) => (
          <div key={turn.id}>
            <article className="chat-turn chat-turn-agent">
              <div className="chat-bubble chat-bubble-agent">
                <p>{turn.question}</p>
              </div>
              <div className="chat-meta">
                <span>Walking Thoughts</span>
              </div>
            </article>
            <article className="chat-turn chat-turn-you">
              <div className="chat-bubble chat-bubble-you">
                <p>{turn.skipped ? "(skipped)" : turn.answer}</p>
              </div>
              <div className="chat-meta">
                <span>You</span>
              </div>
            </article>
          </div>
        ))}

        {openTurn ? (
          <article className="chat-turn chat-turn-agent" data-testid="interview-question">
            <div className="chat-bubble chat-bubble-agent">
              <p>{openTurn.question}</p>
            </div>
            <div className="chat-meta">
              <span>Walking Thoughts</span>
            </div>
          </article>
        ) : null}

        {!started && !openTurn ? (
          <p className="interview-intro">
            Answer a few questions about who you are, where you walk, and what
            you care about. Future Enrichments use those Memories to skip what
            you know and dig into what you don&apos;t.
          </p>
        ) : null}

        {complete ? (
          <p className="interview-complete" data-testid="interview-complete">
            That&apos;s everything for now — the Interview picks back up when
            there&apos;s something new worth asking.
          </p>
        ) : null}

        <section
          className="interview-memories-section"
          aria-label="What Walking Thoughts remembers"
        >
          <h2>What Walking Thoughts remembers</h2>
          <MemoryList memories={memories} onForget={(id) => void forget(id)} />
        </section>
      </div>

      {error ? (
        <p className="capture-error" role="alert">
          {error}
        </p>
      ) : null}

      <footer className="thread-chat-composer">
        {openTurn ? (
          <>
            <label className="capture-field-label" htmlFor="interview-answer">
              Your answer
            </label>
            <textarea
              id="interview-answer"
              rows={2}
              value={draft}
              placeholder="Answer in your own words…"
              onChange={(event) => setDraft(event.target.value)}
              disabled={busy}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (draft.trim()) void post({ answer: draft.trim() });
                }
              }}
            />
            <div className="thread-chat-actions">
              <button
                type="button"
                className="capture-add-media"
                onClick={() => void post({ skip: true })}
                disabled={busy}
              >
                Skip this one
              </button>
              <button
                type="button"
                className="thread-chat-send"
                data-testid="interview-send"
                onClick={() => void post({ answer: draft.trim() })}
                disabled={busy || !draft.trim()}
              >
                {busy ? "Thinking…" : "Answer"}
              </button>
            </div>
          </>
        ) : (
          <div className="thread-chat-actions">
            <button
              type="button"
              className="thread-chat-send"
              data-testid="interview-start"
              onClick={() => void post({})}
              disabled={busy || complete}
            >
              {busy
                ? "Thinking…"
                : started
                  ? "Ask another question"
                  : "Start the Interview"}
            </button>
          </div>
        )}
      </footer>

      <AppNav />
    </div>
  );
}
