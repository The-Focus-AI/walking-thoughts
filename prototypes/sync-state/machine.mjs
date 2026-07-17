// PROTOTYPE: portable, in-memory state machine for sync and Enrichment semantics.

export function initialState() {
  return {
    connectivity: "offline",
    nextId: 1,
    selectedModel: "anthropic/claude-sonnet-4.5",
    failNext: null,
    threads: {},
    jobs: [],
    lastEvent: "Ready. Captures commit locally even while offline.",
  };
}

const id = (state, prefix) => `${prefix}-${state.nextId++}`;

function threadFor(state, threadId) {
  return (state.threads[threadId] ??= {
    id: threadId,
    revision: 0,
    entries: [],
  });
}

function activeJob(state, threadId, kind) {
  return state.jobs.find(
    (job) =>
      job.threadId === threadId &&
      job.kind === kind &&
      ["queued", "running", "failed"].includes(job.status),
  );
}

function queueUpload(state, thread) {
  if (state.connectivity !== "online" || activeJob(state, thread.id, "upload")) return;
  const captureIds = thread.entries
    .filter((entry) => entry.kind === "capture" && entry.sync === "local")
    .map((entry) => entry.id);
  if (!captureIds.length) return;
  const jobId = id(state, "job");
  state.jobs.push({
    id: jobId,
    idempotencyKey: `upload:${thread.id}:${captureIds.join(",")}`,
    kind: "upload",
    threadId: thread.id,
    captureIds,
    status: "queued",
    attempts: 0,
  });
}

function queueEnrichment(state, thread) {
  if (state.connectivity !== "online" || activeJob(state, thread.id, "enrich")) return;
  const targetCaptureIds = thread.entries
    .filter(
      (entry) =>
        entry.kind === "capture" && entry.sync === "synced" && !entry.includedBy,
    )
    .map((entry) => entry.id);
  if (!targetCaptureIds.length) return;
  const basisEntryIds = thread.entries.map((entry) => entry.id);
  const jobId = id(state, "job");
  state.jobs.push({
    id: jobId,
    idempotencyKey: `enrich:${thread.id}:r${thread.revision}`,
    kind: "enrich",
    threadId: thread.id,
    basisRevision: thread.revision,
    basisEntryIds,
    targetCaptureIds,
    model: state.selectedModel,
    status: "queued",
    attempts: 0,
  });
}

function reconcile(state) {
  for (const thread of Object.values(state.threads)) queueUpload(state, thread);
  for (const thread of Object.values(state.threads)) queueEnrichment(state, thread);
  return state;
}

function completeUpload(state, job) {
  const thread = state.threads[job.threadId];
  for (const captureId of job.captureIds) {
    const capture = thread.entries.find((entry) => entry.id === captureId);
    if (capture && capture.sync === "local") {
      capture.sync = "synced";
      thread.revision += 1;
    }
  }
  job.status = "complete";
  state.lastEvent = `${job.id} uploaded ${job.captureIds.length} Capture(s).`;
}

function completeEnrichment(state, job) {
  const thread = state.threads[job.threadId];
  const enrichmentId = `enrichment:${job.id}`;
  if (!thread.entries.some((entry) => entry.id === enrichmentId)) {
    thread.entries.push({
      id: enrichmentId,
      kind: "enrichment",
      basisRevision: job.basisRevision,
      basisEntryIds: [...job.basisEntryIds],
      model: job.model,
      text: `AI response for ${job.targetCaptureIds.join(", ")}`,
    });
    thread.revision += 1;
  }
  for (const captureId of job.targetCaptureIds) {
    const capture = thread.entries.find((entry) => entry.id === captureId);
    if (capture && !capture.includedBy) capture.includedBy = enrichmentId;
  }
  job.status = "complete";
  state.lastEvent = `${job.id} appended ${enrichmentId} from frozen revision ${job.basisRevision}.`;
}

function advance(state) {
  if (state.connectivity !== "online") {
    state.lastEvent = "No work advanced: device is offline.";
    return state;
  }
  // Prefer starting queued work so independent Threads (and a later upload in the
  // same Thread) can overlap work that is already running.
  const job =
    state.jobs.find((candidate) => candidate.status === "queued") ??
    state.jobs.find((candidate) => candidate.status === "running");
  if (!job) {
    state.lastEvent = "No runnable work.";
    return state;
  }
  if (job.status === "queued") {
    job.status = "running";
    job.attempts += 1;
    state.lastEvent = `${job.id} (${job.kind}) started.`;
    return state;
  }
  if (state.failNext === job.kind) {
    state.failNext = null;
    job.status = "failed";
    job.error = "Injected network/provider failure";
    state.lastEvent = `${job.id} failed; local content remains intact.`;
    return state;
  }
  if (job.kind === "upload") completeUpload(state, job);
  else completeEnrichment(state, job);
  return reconcile(state);
}

function captureStatus(state, thread, capture) {
  const related = state.jobs.filter(
    (job) =>
      job.threadId === thread.id &&
      (job.captureIds?.includes(capture.id) || job.targetCaptureIds?.includes(capture.id)),
  );
  if (related.some((job) => job.status === "failed")) return "needs attention";
  if (capture.includedBy) return "complete";
  if (capture.sync === "local") {
    return related.some((job) => ["queued", "running"].includes(job.status))
      ? "syncing"
      : "saved locally";
  }
  return "enriching";
}

export function view(state) {
  return {
    connectivity: state.connectivity,
    failNext: state.failNext,
    lastEvent: state.lastEvent,
    threads: Object.values(state.threads).map((thread) => ({
      id: thread.id,
      serverRevision: thread.revision,
      entries: thread.entries.map((entry) =>
        entry.kind === "capture"
          ? {
              id: entry.id,
              kind: entry.kind,
              text: entry.text,
              sync: entry.sync,
              visibleState: captureStatus(state, thread, entry),
              includedBy: entry.includedBy ?? null,
            }
          : { ...entry },
      ),
    })),
    jobs: state.jobs.map((job) => ({ ...job })),
  };
}

export function dispatch(current, action) {
  const state = structuredClone(current);
  switch (action.type) {
    case "capture": {
      const thread = threadFor(state, action.threadId);
      const captureId = id(state, "capture");
      thread.entries.push({
        id: captureId,
        kind: "capture",
        text: action.text,
        sync: "local",
        includedBy: null,
      });
      state.lastEvent = `${captureId} committed locally to ${thread.id}.`;
      break;
    }
    case "connectivity":
      state.connectivity = action.value;
      state.lastEvent = `Connectivity changed to ${action.value}.`;
      break;
    case "advance":
      return advance(state);
    case "failNext":
      state.failNext = action.kind;
      state.lastEvent = `Next running ${action.kind} job will fail on completion.`;
      return state;
    case "retry": {
      const failed = state.jobs.filter(
        (job) => job.status === "failed" && (action.jobId === "all" || job.id === action.jobId),
      );
      for (const job of failed) {
        job.status = "queued";
        delete job.error;
      }
      state.lastEvent = `Requeued ${failed.length} failed job(s) with the same idempotency keys.`;
      break;
    }
    case "replay": {
      const job = state.jobs.find((candidate) => candidate.id === action.jobId);
      if (!job || job.status !== "complete") {
        state.lastEvent = `${action.jobId} is not a completed job.`;
        return state;
      }
      if (job.kind === "upload") completeUpload(state, job);
      else completeEnrichment(state, job);
      state.lastEvent += " Duplicate delivery was harmless.";
      break;
    }
    default:
      state.lastEvent = `Unknown action: ${action.type}`;
      return state;
  }
  return reconcile(state);
}

export function drain(current, limit = 100) {
  let state = current;
  for (let i = 0; i < limit; i += 1) {
    const runnable = state.jobs.some((job) => ["queued", "running"].includes(job.status));
    if (!runnable || state.connectivity !== "online") return state;
    state = dispatch(state, { type: "advance" });
  }
  return state;
}
