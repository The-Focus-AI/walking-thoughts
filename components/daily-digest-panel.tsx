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
 * Assemble today's Captures and their Enrichments from local store + cache.
 * Day membership follows Capture createdAt (local calendar day).
 */
async function loadTodayCorpus(dayKey: string): Promise<DayCorpusEntry[]> {
  const store = getCaptureStore();
  const [captures, threads] = await Promise.all([
    store.list(),
    store.listRecentThreads(),
  ]);
  const titleById = new Map(threads.map((thread) => [thread.id, thread.title]));
  const todays = captures.filter(
    (capture) => calendarDayKey(new Date(capture.createdAt)) === dayKey,
  );

  const entries: DayCorpusEntry[] = [];
  const threadIds = [
    ...new Set(
      todays
        .map((capture) => capture.threadId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  for (const capture of todays) {
    if (!capture.threadId) continue;
    entries.push({
      kind: "capture",
      id: capture.id,
      threadId: capture.threadId,
      threadTitle: titleById.get(capture.threadId) ?? "Untitled Thread",
      text: capture.text,
      createdAt: capture.createdAt,
    });
  }

  for (const threadId of threadIds) {
    const enrichments = await loadThreadEnrichments(threadId);
    for (const enrichment of enrichments) {
      const target = todays.find((capture) =>
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
 * Desk surface for talking to the whole day — every Thread's Captures and
 * Enrichments — not a single Thread follow-up.
 */
export function DailyDigestPanel() {
  const dayKey = calendarDayKey();
  const dayHeading = formatDayHeading(dayKey);
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
      const corpus = await loadTodayCorpus(dayKey);
      setCorpusCount(corpus.length);
      if (corpus.length === 0) {
        setError("No Captures for today yet — commit something on the trail first.");
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
      className="interview-section digest-section"
      aria-label="Today's digest"
      data-testid="daily-digest"
    >
      <h2 className="interview-section-title">Today</h2>
      <p className="digest-lede">
        Ask across every Thread from {dayHeading} — checklists, summaries,
        follow-ups. Not one Thread at a time.
      </p>
      {corpusCount != null ? (
        <p className="digest-count">
          {corpusCount} {corpusCount === 1 ? "entry" : "entries"} ready
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
        Ask about today
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
          Digesting — reading every Thread from today.
        </p>
      ) : null}
      {error ? (
        <p className="interview-error" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <article className="digest-result" data-testid="digest-result">
          <p className="digest-result-head">
            Digest · {result.model}
          </p>
          <div className="enrichment-markdown">
            <Markdown>{result.text}</Markdown>
          </div>
        </article>
      ) : null}
    </section>
  );
}
