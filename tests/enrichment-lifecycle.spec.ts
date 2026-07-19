import { expect, test } from "@playwright/test";
import {
  dispatch,
  drain,
  initialState,
  view,
} from "@/lib/enrichment/lifecycle";

test("batches pending Captures in one Thread into one Enrichment", async () => {
  let state = initialState();
  state = dispatch(state, {
    type: "capture",
    threadId: "trail",
    text: "Barred owl",
  });
  state = dispatch(state, {
    type: "capture",
    threadId: "trail",
    text: "Near the creek",
  });
  state = dispatch(state, { type: "connectivity", value: "online" });
  state = drain(state);

  const trail = view(state).threads.find((thread) => thread.id === "trail");
  const captures = trail?.entries.filter((entry) => entry.kind === "capture") ?? [];
  const enrichments =
    trail?.entries.filter((entry) => entry.kind === "enrichment") ?? [];
  expect(captures).toHaveLength(2);
  expect(enrichments).toHaveLength(1);
  expect(
    captures.every(
      (capture) =>
        capture.kind === "capture" &&
        capture.visibleState === "complete" &&
        capture.includedBy === enrichments[0]?.id,
    ),
  ).toBe(true);
});

test("Capture during Enrichment is excluded then included later", async () => {
  let state = initialState();
  state = dispatch(state, {
    type: "capture",
    threadId: "trail",
    text: "First sighting",
  });
  state = dispatch(state, { type: "connectivity", value: "online" });
  // upload start + upload complete + enrich start
  state = dispatch(state, { type: "advance" });
  state = dispatch(state, { type: "advance" });
  state = dispatch(state, { type: "advance" });

  const mid = view(state);
  const enrichRunning = mid.jobs.find(
    (job) => job.kind === "enrich" && job.status === "running",
  );
  expect(enrichRunning).toBeTruthy();
  const frozenTargets = [...(enrichRunning?.targetCaptureIds ?? [])];

  state = dispatch(state, {
    type: "capture",
    threadId: "trail",
    text: "Arrived while enriching",
  });
  state = drain(state);

  const trail = view(state).threads.find((thread) => thread.id === "trail");
  const enrichments =
    trail?.entries.filter((entry) => entry.kind === "enrichment") ?? [];
  expect(enrichments).toHaveLength(2);
  expect(frozenTargets).toEqual(["capture-1"]);
  const late = trail?.entries.find(
    (entry) => entry.kind === "capture" && entry.text === "Arrived while enriching",
  );
  expect(late && late.kind === "capture" ? late.includedBy : null).toBe(
    enrichments[1]?.id,
  );
});

test("parallel Threads enrich independently", async () => {
  let state = initialState();
  state = dispatch(state, {
    type: "capture",
    threadId: "a",
    text: "Cedar",
  });
  state = dispatch(state, {
    type: "capture",
    threadId: "b",
    text: "Stream",
  });
  state = dispatch(state, { type: "connectivity", value: "online" });
  state = drain(state);

  const viewed = view(state);
  expect(viewed.threads).toHaveLength(2);
  for (const thread of viewed.threads) {
    const enrichments = thread.entries.filter(
      (entry) => entry.kind === "enrichment",
    );
    expect(enrichments).toHaveLength(1);
  }
});

test("failure, retry, and replay never duplicate Enrichments", async () => {
  let state = initialState();
  state = dispatch(state, {
    type: "capture",
    threadId: "trail",
    text: "Needs care",
  });
  state = dispatch(state, { type: "connectivity", value: "online" });
  state = dispatch(state, { type: "advance" }); // upload start
  state = dispatch(state, { type: "advance" }); // upload complete
  state = dispatch(state, { type: "failNext", kind: "enrich" });
  state = dispatch(state, { type: "advance" }); // enrich start
  state = dispatch(state, { type: "advance" }); // enrich fail

  let trail = view(state).threads.find((thread) => thread.id === "trail");
  const capture = trail?.entries.find((entry) => entry.kind === "capture");
  expect(capture && capture.kind === "capture" ? capture.visibleState : null).toBe(
    "needs attention",
  );

  state = dispatch(state, { type: "retry", jobId: "all" });
  state = drain(state);
  trail = view(state).threads.find((thread) => thread.id === "trail");
  let enrichments =
    trail?.entries.filter((entry) => entry.kind === "enrichment") ?? [];
  expect(enrichments).toHaveLength(1);

  const enrichJob = view(state).jobs.find(
    (job) => job.kind === "enrich" && job.status === "complete",
  );
  expect(enrichJob).toBeTruthy();
  state = dispatch(state, { type: "replay", jobId: enrichJob!.id });
  trail = view(state).threads.find((thread) => thread.id === "trail");
  enrichments =
    trail?.entries.filter((entry) => entry.kind === "enrichment") ?? [];
  expect(enrichments).toHaveLength(1);
});
