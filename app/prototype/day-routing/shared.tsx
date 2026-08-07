"use client";

/**
 * PROTOTYPE — shared state model for the day-routing flow.
 *
 * The model under test: filing's primary verb is the Route, and settling a
 * Route DOES it — the Thread is reviewed and its handoff happens right
 * then (simulated here). There is no separate commit step; the final
 * screen is a receipt, and undo pulls a Thread back into the deck.
 */

import { useMemo, useState } from "react";
import {
  DESTINATION_LABEL,
  THREADS,
  type ProtoDestination,
  type ProtoThread,
} from "./fixture";

export type RouteStatus = "proposed" | "settled";

export type Route = {
  destination: ProtoDestination;
  projectId: string | null;
  status: RouteStatus;
};

export type RoutingState = Record<string, Route>;

export type RoutingActions = {
  state: RoutingState;
  /** Settle whatever is currently proposed for the Thread — it happens now. */
  accept(threadId: string): void;
  /** Redirect to a different destination and settle in one gesture. */
  routeTo(
    threadId: string,
    destination: ProtoDestination,
    projectId?: string | null,
  ): void;
  setProject(threadId: string, projectId: string | null): void;
  /** Undo: pull a settled Thread back into the deck. */
  reopen(threadId: string): void;
};

export function useRoutingState(): RoutingActions {
  const [state, setState] = useState<RoutingState>(() =>
    Object.fromEntries(
      THREADS.map((thread) => [
        thread.id,
        {
          destination: thread.proposedDestination,
          projectId: thread.proposedProjectId ?? null,
          status: "proposed" as RouteStatus,
        },
      ]),
    ),
  );

  return useMemo<RoutingActions>(() => {
    function patch(threadId: string, part: Partial<Route>) {
      setState((prev) => ({
        ...prev,
        [threadId]: { ...prev[threadId], ...part },
      }));
    }
    return {
      state,
      accept: (id) => patch(id, { status: "settled" }),
      routeTo: (id, destination, projectId) =>
        patch(id, {
          destination,
          status: "settled",
          ...(projectId !== undefined ? { projectId } : {}),
        }),
      setProject: (id, projectId) => patch(id, { projectId }),
      reopen: (id) => patch(id, { status: "proposed" }),
    };
  }, [state]);
}

export function countByDestination(
  state: RoutingState,
): Record<ProtoDestination, { proposed: number; settled: number }> {
  const counts = {
    spec: { proposed: 0, settled: 0 },
    todo: { proposed: 0, settled: 0 },
    journal: { proposed: 0, settled: 0 },
    timeline: { proposed: 0, settled: 0 },
    drop: { proposed: 0, settled: 0 },
  };
  for (const route of Object.values(state)) {
    counts[route.destination][
      route.status === "settled" ? "settled" : "proposed"
    ] += 1;
  }
  return counts;
}

/** Skill rule: surface the state — running tally shown on every step. */
export function StateReadout({ state }: { state: RoutingState }) {
  const routes = Object.values(state);
  const toRoute = routes.filter((route) => route.status === "proposed").length;
  const counts = countByDestination(state);
  return (
    <div className="dr-readout" role="status">
      <span>
        <strong>{toRoute}</strong> to route
      </span>
      {(Object.keys(counts) as ProtoDestination[]).map((destination) =>
        counts[destination].settled > 0 ? (
          <span key={destination}>
            <strong>{counts[destination].settled}</strong>{" "}
            {DESTINATION_LABEL[destination].toLowerCase()}
          </span>
        ) : null,
      )}
    </div>
  );
}

export function KindChip({ thread }: { thread: ProtoThread }) {
  return <span className={`dr-kind dr-kind-${thread.kind}`}>{thread.kind}</span>;
}

export function DestinationChip({
  destination,
  status,
}: {
  destination: ProtoDestination;
  status: RouteStatus;
}) {
  return (
    <span
      className={`dr-dest dr-dest-${destination} ${
        status === "proposed" ? "dr-dest-proposed" : "dr-dest-confirmed"
      }`}
    >
      {DESTINATION_LABEL[destination]}
      {status === "proposed" ? "?" : ""}
    </span>
  );
}
