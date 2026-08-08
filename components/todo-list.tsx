"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { SyncRuntime } from "@/components/sync-runtime";
import { collectTodos, setTodoDone, type TodoItem } from "@/lib/desk/todo";
import { formatDayShort } from "@/lib/local-capture/calendar-day";
import { getCaptureStore } from "@/lib/local-capture/store";
import { SYNC_CYCLE_EVENT } from "@/lib/sync/cycle";

/**
 * The To-do destination (docs/desk.md, D2): every Thread the walker routed
 * to To-do, as checkable items in their own words. Checking one off is an
 * action here, on the destination surface — the Thread stays filed exactly
 * as it was routed. Un-routing at the desk removes the item, because the
 * list is fed by the route itself, not a copy of it.
 */
async function readTodos(): Promise<TodoItem[]> {
  const store = getCaptureStore();
  const [captures, threads] = await Promise.all([
    store.list(),
    store.listRecentThreads(),
  ]);
  return collectTodos(threads, captures);
}

export function TodoList() {
  const [items, setItems] = useState<TodoItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read on mount, then re-read after each sync cycle so a to-do routed or
  // checked off on another device lands here — the live pile, not a snapshot.
  useEffect(() => {
    let active = true;
    const load = async () => {
      const todos = await readTodos();
      if (active) setItems(todos);
    };
    void load().catch(() => undefined);
    const onCycle = () => void load().catch(() => undefined);
    window.addEventListener(SYNC_CYCLE_EVENT, onCycle);
    return () => {
      active = false;
      window.removeEventListener(SYNC_CYCLE_EVENT, onCycle);
    };
  }, []);

  async function toggle(item: TodoItem) {
    if (busyId) return;
    setBusyId(item.threadId);
    setError(null);
    try {
      if (!(await setTodoDone(item.threadId, !item.todoDoneAt))) {
        setError("Checking off needs a connection.");
        return;
      }
      setItems(await readTodos());
    } finally {
      setBusyId(null);
    }
  }

  const open = items?.filter((item) => !item.todoDoneAt) ?? [];

  return (
    <main className="interview-sheet todo-sheet" data-testid="todo-list">
      <SyncRuntime />
      <header>
        <p className="eyebrow">The task list</p>
        <h1>To-do</h1>
        <p>
          What you told the trail to put on the list — in your words. Checking
          one off is done here; the Thread stays filed where you routed it.
        </p>
      </header>

      {error ? (
        <p className="capture-error" role="alert">
          {error}
        </p>
      ) : null}

      {items === null ? (
        <p className="todo-empty">Opening the list…</p>
      ) : items.length === 0 ? (
        <p className="todo-empty" data-testid="todo-empty">
          Nothing on the list. Route a Thread to To-do at the desk and it
          lands here.
        </p>
      ) : (
        <ul className="todo-items" aria-label="To-do items">
          {items.map((item) => (
            <li
              key={item.threadId}
              className={item.todoDoneAt ? "todo-item todo-item-done" : "todo-item"}
              data-testid={`todo-item-${item.threadId}`}
            >
              <label className="todo-check">
                <input
                  type="checkbox"
                  checked={Boolean(item.todoDoneAt)}
                  disabled={busyId === item.threadId}
                  data-testid={`todo-check-${item.threadId}`}
                  onChange={() => void toggle(item)}
                />
                <span className="todo-text">{item.text}</span>
              </label>
              <Link
                className="todo-thread-link"
                href={`/threads/${item.threadId}`}
              >
                {formatDayShort(item.dayKey)}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items && items.length > 0 ? (
        <p className="todo-tally" data-testid="todo-tally">
          {open.length} open · {items.length - open.length} done
        </p>
      ) : null}

      <AppNav />
    </main>
  );
}
