"use client";

/**
 * PROTOTYPE — shared state model for day-routing variants.
 *
 * The state model is the question under test: filing's primary verb becomes
 * a destination. A Thread starts with the Enrichment's *proposed* route and
 * the walker confirms or redirects it; confirming any route marks the Thread
 * reviewed as a side effect. "Dispatch" commits every confirmed route.
 */

import { useMemo, useState } from "react";
import {
  DESTINATION_LABEL,
  THREADS,
  type ProtoDestination,
  type ProtoThread,
} from "./fixture";

export type RouteStatus = "proposed" | "confirmed";

export type Route = {
  destination: ProtoDestination;
  projectId: string | null;
  status: RouteStatus;
};

export type RoutingState = Record<string, Route>;

export type RoutingActions = {
  state: RoutingState;
  dispatched: boolean;
  /** Confirm whatever is currently proposed for the Thread. */
  accept(threadId: string): void;
  /** Redirect to a different destination and confirm in one gesture. */
  routeTo(
    threadId: string,
    destination: ProtoDestination,
    projectId?: string | null,
  ): void;
  setProject(threadId: string, projectId: string | null): void;
  /** Put a confirmed Thread back to proposed. */
  reopen(threadId: string): void;
  dispatch(): void;
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
  const [dispatched, setDispatched] = useState(false);

  return useMemo<RoutingActions>(() => {
    function patch(threadId: string, part: Partial<Route>) {
      setState((prev) => ({
        ...prev,
        [threadId]: { ...prev[threadId], ...part },
      }));
    }
    return {
      state,
      dispatched,
      accept: (id) => patch(id, { status: "confirmed" }),
      routeTo: (id, destination, projectId) =>
        patch(id, {
          destination,
          status: "confirmed",
          ...(projectId !== undefined ? { projectId } : {}),
        }),
      setProject: (id, projectId) => patch(id, { projectId }),
      reopen: (id) => patch(id, { status: "proposed" }),
      dispatch: () => setDispatched(true),
    };
  }, [state, dispatched]);
}

export function countByDestination(
  state: RoutingState,
): Record<ProtoDestination, { proposed: number; confirmed: number }> {
  const counts = {
    spec: { proposed: 0, confirmed: 0 },
    todo: { proposed: 0, confirmed: 0 },
    journal: { proposed: 0, confirmed: 0 },
    timeline: { proposed: 0, confirmed: 0 },
    drop: { proposed: 0, confirmed: 0 },
  };
  for (const route of Object.values(state)) {
    counts[route.destination][route.status === "confirmed" ? "confirmed" : "proposed"] += 1;
  }
  return counts;
}

/** Skill rule: surface the state — running tally shown in every variant. */
export function StateReadout({
  state,
  dispatched,
}: {
  state: RoutingState;
  dispatched: boolean;
}) {
  const routes = Object.values(state);
  const unsettled = routes.filter((route) => route.status === "proposed").length;
  const counts = countByDestination(state);
  return (
    <div className="dr-readout" role="status">
      <span>
        <strong>{unsettled}</strong> unsettled
      </span>
      {(Object.keys(counts) as ProtoDestination[]).map((destination) =>
        counts[destination].confirmed > 0 ? (
          <span key={destination}>
            <strong>{counts[destination].confirmed}</strong>{" "}
            {DESTINATION_LABEL[destination].toLowerCase()}
          </span>
        ) : null,
      )}
      <span className={dispatched ? "dr-readout-done" : undefined}>
        {dispatched ? "day dispatched" : "not dispatched"}
      </span>
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
