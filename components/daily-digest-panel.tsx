"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import {
  clearDayChat,
  readDayChat,
  writeDayChat,
  type DayChatMessage,
} from "@/lib/digest/chat-store";
import { readCachedArtifacts } from "@/lib/artifacts/client";
import { collectTodos } from "@/lib/desk/todo";
import { collectDayCorpus } from "@/lib/digest/corpus";
import { summarizeDay, type DaySheet } from "@/lib/digest/day-sheet";
import type {
  DayCorpusEntry,
  DayDigestResult,
  DayRoutedTodo,
} from "@/lib/digest/types";
import { readCachedThreadEnrichments } from "@/lib/enrichment/thread-view";
import {
  fetchWithTimeout,
  isTimeoutError,
  MODEL_TIMEOUT_MS,
} from "@/lib/net/timeout";
import {
  calendarDayKey,
  formatDayHeading,
} from "@/lib/local-capture/calendar-day";
import { getCaptureStore } from "@/lib/local-capture/store";
import { KIND_LABELS } from "@/lib/local-capture/types";

const SUGGESTIONS = [
  "Create a task checklist of the day",
  "Summarize what I noticed on the trail",
  "List open questions still worth following up",
] as const;

/** Most recent chat turns sent back to the digest for context. */
const HISTORY_TURN_LIMIT = 24;

function digestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const testUser = process.env.NEXT_PUBLIC_SYNC_TEST_USER_ID;
  if (testUser) headers["x-walking-thoughts-test-user"] = testUser;
  return headers;
}

/**
 * Assemble Captures and Enrichments for one civil day from local store + the
 * retained Enrichment cache only. Never awaits the network — Ask must not
 * hang when Enrichment GETs stall (the Threads list already refreshes those
 * in the background).
 */
export async function loadDayCorpus(dayKey: string): Promise<DayCorpusEntry[]> {
  const store = getCaptureStore();
  const [captures, threads] = await Promise.all([
    store.list(),
    store.listRecentThreads(),
  ]);
  const titleById = new Map(threads.map((thread) => [thread.id, thread.title]));
  const daysCaptures = captures.filter(
    (capture) => calendarDayKey(new Date(capture.createdAt)) === dayKey,
  );

  const entries: DayCorpusEntry[] = [];
  const threadIds = [
    ...new Set(
      daysCaptures
        .map((capture) => capture.threadId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  for (const capture of daysCaptures) {
    entries.push({
      kind: "capture",
      id: capture.id,
      threadId: capture.threadId ?? "unthreaded",
      threadTitle: capture.threadId
        ? (titleById.get(capture.threadId) ?? "Untitled Thread")
        : "Untitled Thread",
      text: capture.text,
      createdAt: capture.createdAt,
    });
  }

  for (const threadId of threadIds) {
    const enrichments = readCachedThreadEnrichments(threadId);
    for (const enrichment of enrichments) {
      const target = daysCaptures.find((capture) =>
        enrichment.targetCaptureIds.includes(capture.id),
      );
      if (!target) continue;
      entries.push({
        kind: "enrichment",
        id: enrichment.id,
        threadId,
        threadTitle: titleById.get(threadId) ?? "Untitled Thread",
        text: enrichment.text,
        createdAt: enrichment.createdAt,
        captureCreatedAt: target.createdAt,
      });
    }
  }

  return collectDayCorpus(entries, dayKey);
}

/**
 * The day's routed to-dos, read locally the way the corpus is. Sent with
 * every ask so a checklist question lists what the walker actually routed
 * instead of the model re-deriving tasks (docs/desk.md, D2).
 */
export async function loadDayRoutedTodos(
  dayKey: string,
): Promise<DayRoutedTodo[]> {
  const store = getCaptureStore();
  const [captures, threads] = await Promise.all([
    store.list(),
    store.listRecentThreads(),
  ]);
  return collectTodos(threads, captures)
    .filter((item) => item.dayKey === dayKey)
    .map((item) => ({
      threadId: item.threadId,
      text: item.text,
      done: Boolean(item.todoDoneAt),
    }));
}

type DailyDigestPanelProps = {
  /** Local calendar day (YYYY-MM-DD) to chat about. */
  dayKey: string;
  /** Close — returns to the day list. */
  onClose?: () => void;
  /** The day's Threads, printed between the day sheet and the conversation. */
  children?: React.ReactNode;
};

/**
 * The day at a glance, before any question is asked: what it holds, what it
 * left to do, and what Walking Thoughts could not place. Read from local
 * state, so it paints offline and instantly.
 */
function DaySheetPanel({ sheet, dayKey }: { sheet: DaySheet; dayKey: string }) {
  if (sheet.threadCount === 0) return null;
  return (
    <aside className="day-sheet" data-testid="day-sheet">
      <dl className="day-sheet-instruments">
        <div>
          <dt>Threads</dt>
          <dd>{sheet.threadCount}</dd>
        </div>
        <div>
          <dt>Captures</dt>
          <dd>{sheet.captureCount}</dd>
        </div>
        {sheet.photoCount > 0 ? (
          <div>
            <dt>Media</dt>
            <dd>{sheet.photoCount}</dd>
          </div>
        ) : null}
        {sheet.toRead.length > 0 ? (
          <div data-testid="day-sheet-reports">
            <dt>To read</dt>
            <dd>{sheet.toRead.length}</dd>
          </div>
        ) : null}
        <div>
          <dt>Reviewed</dt>
          <dd>
            {sheet.reviewed} of {sheet.threadCount}
          </dd>
        </div>
      </dl>

      {sheet.kinds.length > 0 ? (
        <p className="day-sheet-kinds">
          {sheet.kinds.map(({ kind, count }) => (
            <span key={kind} className="day-sheet-kind">
              <b>{count}</b> {KIND_LABELS[kind]}
            </span>
          ))}
          {sheet.unclassified > 0 ? (
            <span className="day-sheet-kind">
              <b>{sheet.unclassified}</b> still enriching
            </span>
          ) : null}
        </p>
      ) : null}

      {/* What the day still wants, said once — and tappable: the link
          filters the day down to exactly those Threads, each carrying its
          question and an answer box on the row. */}
      {sheet.needsWord.length > 0 ? (
        <p className="day-sheet-asks" data-testid="day-sheet-asks">
          {sheet.needsWord.length}{" "}
          {sheet.needsWord.length === 1 ? "Thread needs" : "Threads need"} a
          word from you —{" "}
          <Link href={`/days/${dayKey}?f=word`} data-testid="day-sheet-answer">
            answer {sheet.needsWord.length === 1 ? "it" : "them"}
          </Link>
        </p>
      ) : null}
    </aside>
  );
}

/**
 * One day at the desk: what it holds, the Threads it left, and an ongoing
 * conversation with all of them at once. The transcript is retained on this
 * phone per day, and each ask carries the conversation so far, so the walker
 * can go back and forth instead of firing one-off digests.
 */
export function DailyDigestPanel({
  dayKey,
  onClose,
  children,
}: DailyDigestPanelProps) {
  const dayHeading = formatDayHeading(dayKey);
  const isToday = dayKey === calendarDayKey();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<DayChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<DaySheet | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  // Restore the retained transcript after mount (never during hydration —
  // localStorage only exists on the client, so the server render is empty).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only storage restore after hydration
    setMessages(readDayChat(dayKey));
  }, [dayKey]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const store = getCaptureStore();
      const [captures, threads] = await Promise.all([
        store.list(),
        store.listRecentThreads(),
      ]);
      if (!active) return;
      setSheet(
        summarizeDay({
          threads,
          captures,
          dayKey,
          // The retained list: the sheet paints offline, and the desk has
          // already refreshed it from the server by the time a day opens.
          threadsWithReports: new Set(
            readCachedArtifacts().map((artifact) => artifact.threadId),
          ),
        }),
      );
    };
    void load().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [dayKey]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, busy]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    const before = messages;
    const walkerTurn: DayChatMessage = {
      role: "walker",
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages([...before, walkerTurn]);
    setDraft("");
    try {
      const [corpus, routedTodos] = await Promise.all([
        loadDayCorpus(dayKey),
        loadDayRoutedTodos(dayKey),
      ]);
      if (corpus.length === 0) {
        throw new Error(
          isToday
            ? "No Captures for today yet — commit something on the trail first."
            : `No Captures for ${dayHeading}.`,
        );
      }
      const response = await fetchWithTimeout(
        "/api/digest",
        {
          method: "POST",
          headers: digestHeaders(),
          body: JSON.stringify({
            dayKey,
            dayHeading,
            question: trimmed,
            corpus,
            routedTodos,
            history: before
              .slice(-HISTORY_TURN_LIMIT)
              .map(({ role, text }) => ({ role, text })),
          }),
        },
        MODEL_TIMEOUT_MS,
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Digest failed (${response.status})`);
      }
      const body = (await response.json()) as DayDigestResult;
      const digestTurn: DayChatMessage = {
        role: "digest",
        text: body.text,
        model: body.model,
        createdAt: new Date().toISOString(),
      };
      const next = [...before, walkerTurn, digestTurn];
      setMessages(next);
      writeDayChat(dayKey, next);
    } catch (cause) {
      // Nothing was answered: put the question back in the composer.
      setMessages(before);
      setDraft(trimmed);
      const offline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      setError(
        offline
          ? "Day chat needs a connection. It will be here when you're back in range."
          : isTimeoutError(cause)
            ? "The signal is too weak right now — your question is back in the box, try again in better range."
            : cause instanceof Error
              ? cause.message
              : "Digest could not run.",
      );
    } finally {
      setBusy(false);
    }
  }

  function clearChat() {
    clearDayChat(dayKey);
    setMessages([]);
    setError(null);
  }

  return (
    <section
      className="day-digest-pane"
      aria-label={`Day chat for ${dayHeading}`}
      data-testid="daily-digest"
    >
      <header className="day-digest-header">
        <div>
          <p className="eyebrow">{isToday ? "Today" : "Day"}</p>
          <h1>{dayHeading}</h1>
          <p>Read it, file it, and ask the whole day anything.</p>
        </div>
        <div className="day-digest-header-tools">
          {messages.length > 0 ? (
            <button
              type="button"
              className="digest-clear"
              onClick={clearChat}
              disabled={busy}
            >
              Clear chat
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              className="journal-close"
              aria-label="Close day"
              onClick={onClose}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          ) : null}
        </div>
      </header>

      <div className="day-chat-log" ref={logRef}>
        {sheet ? <DaySheetPanel sheet={sheet} dayKey={dayKey} /> : null}
        {children}
        {messages.length === 0 && !busy ? (
          <div
            className="digest-suggestions"
            role="group"
            aria-label="Suggestions"
          >
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="digest-suggestion"
                disabled={busy}
                onClick={() => void ask(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        {messages.map((message, index) =>
          message.role === "walker" ? (
            <p
              key={`${message.createdAt}-${index}`}
              className="day-chat-walker"
              data-testid="digest-walker"
            >
              {message.text}
            </p>
          ) : (
            <article
              key={`${message.createdAt}-${index}`}
              className="digest-result"
              data-testid="digest-result"
            >
              <p className="digest-result-head">
                Digest{message.model ? ` · ${message.model}` : ""}
              </p>
              <div className="enrichment-markdown">
                <Markdown>{message.text}</Markdown>
              </div>
            </article>
          ),
        )}

        {busy ? (
          <p className="interview-status" role="status">
            Digesting — reading every Thread from this day.
          </p>
        ) : null}
        {error ? (
          <p className="interview-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="day-chat-composer">
        <label className="capture-label" htmlFor="digest-ask">
          Ask about this day
        </label>
        <textarea
          id="digest-ask"
          className="interview-input"
          rows={2}
          value={draft}
          placeholder="Ask a follow-up about this day…"
          onChange={(event) => setDraft(event.target.value)}
          disabled={busy}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (draft.trim()) void ask(draft);
            }
          }}
        />
        <div className="interview-actions">
          <button
            type="button"
            className="interview-send"
            data-testid="digest-send"
            onClick={() => void ask(draft)}
            disabled={busy || !draft.trim()}
          >
            Ask
          </button>
        </div>
      </div>
    </section>
  );
}
