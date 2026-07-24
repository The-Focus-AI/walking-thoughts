"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import { collectDayCorpus } from "@/lib/digest/corpus";
import type { DayCorpusEntry, DayDigestResult } from "@/lib/digest/types";
import { loadThreadEnrichments } from "@/lib/enrichment/thread-view";
import {
  calendarDayKey,
  formatDayHeading,
} from "@/lib/local-capture/calendar-day";
import { getCaptureStore } from "@/lib/local-capture/store";

const SUGGESTIONS = [
  "Create a task checklist of the day",
  "Summarize what I noticed on the trail",
  "List open questions still worth following up",
] as const;

function digestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const testUser = process.env.NEXT_PUBLIC_SYNC_TEST_USER_ID;
  if (testUser) headers["x-walking-thoughts-test-user"] = testUser;
  return headers;
}

/**
 * Assemble Captures and Enrichments for one civil day from local store + cache.
 * Day membership follows Capture createdAt (local calendar day).
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
    const enrichments = await loadThreadEnrichments(threadId);
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

type DailyDigestPanelProps = {
  /** Local calendar day (YYYY-MM-DD) to digest. */
  dayKey: string;
  /** Mobile close — returns to the day list. */
  onClose?: () => void;
};

/**
 * Desk surface for talking to one whole day — every Thread's Captures and
 * Enrichments — not a single Thread follow-up.
 */
export function DailyDigestPanel({ dayKey, onClose }: DailyDigestPanelProps) {
  const dayHeading = formatDayHeading(dayKey);
  const isToday = dayKey === calendarDayKey();
  const [draft, setDraft] = useState("");
  const [corpusCount, setCorpusCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DayDigestResult | null>(null);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const corpus = await loadDayCorpus(dayKey);
      setCorpusCount(corpus.length);
      if (corpus.length === 0) {
        setError(
          isToday
            ? "No Captures for today yet — commit something on the trail first."
            : `No Captures for ${dayHeading}.`,
        );
        return;
      }
      const response = await fetch("/api/digest", {
        method: "POST",
        headers: digestHeaders(),
        body: JSON.stringify({
          dayKey,
          dayHeading,
          question: trimmed,
          corpus,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Digest failed (${response.status})`);
      }
      const body = (await response.json()) as DayDigestResult;
      setResult(body);
      setDraft("");
    } catch (cause) {
      const offline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      setError(
        offline
          ? "Day digests need a connection. They will be here when you're back in range."
          : cause instanceof Error
            ? cause.message
            : "Digest could not run.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="day-digest-pane"
      aria-label={`Digest for ${dayHeading}`}
      data-testid="daily-digest"
    >
      <header className="day-digest-header">
        <div>
          <p className="eyebrow">Day digest</p>
          <h1>{dayHeading}</h1>
          <p>
            Ask across every Thread from this day — checklists, summaries,
            follow-ups. Not one Thread at a time.
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            className="journal-close"
            aria-label="Close day digest"
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
      </header>

      {corpusCount != null ? (
        <p className="digest-count">
          {corpusCount}{" "}
          {corpusCount === 1
            ? "Capture or Enrichment"
            : "Captures and Enrichments"}{" "}
          ready
        </p>
      ) : null}

      <div className="digest-suggestions" role="group" aria-label="Suggestions">
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

      <label className="capture-label" htmlFor="digest-ask">
        Ask about this day
      </label>
      <textarea
        id="digest-ask"
        className="interview-input"
        rows={3}
        value={draft}
        placeholder="Create a task checklist of the day"
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
      {result ? (
        <article className="digest-result" data-testid="digest-result">
          <p className="digest-result-head">Digest · {result.model}</p>
          <div className="enrichment-markdown">
            <Markdown>{result.text}</Markdown>
          </div>
        </article>
      ) : null}
    </section>
  );
}
