"use client";

import { useState } from "react";
import { getCaptureStore } from "@/lib/local-capture/store";
import {
  KIND_DESK_ORDER,
  KIND_LABELS,
  type LocalThread,
  type ThreadKind,
} from "@/lib/local-capture/types";
import { getReviewTransport } from "@/lib/sync/review-client";
import type { Project } from "@/lib/sync/types";

/**
 * Filing a Thread at the desk. The Enrichment guesses; the walker settles it.
 * Confirming the kind, putting it in a Project, or simply having read it all
 * file the Thread — it leaves the New queue, and review is done when nothing
 * is left there.
 */
export function ThreadFiling({
  thread,
  projects,
  onFiled,
  onProjectCreated,
}: {
  thread: LocalThread;
  projects: Project[];
  onFiled: () => void;
  onProjectCreated: (project: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newProject, setNewProject] = useState("");

  const filed = Boolean(thread.reviewedAt);

  async function file(filing: {
    kind?: ThreadKind | null;
    projectId?: string | null;
    projectName?: string | null;
    researchVerdict?: "kept" | "dismissed" | null;
  }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const transport = getReviewTransport();
    try {
      const result = await transport.fileThread?.(thread.id, {
        reviewed: true,
        kind: filing.kind,
        projectId: filing.projectId,
        researchVerdict: filing.researchVerdict,
      });
      if (!result) {
        setError("Filing needs a connection.");
        return;
      }
      await getCaptureStore().applyThreadFiling({
        threadId: thread.id,
        reviewedAt: result.reviewedAt,
        kind: (result.kind as ThreadKind | null) ?? filing.kind ?? null,
        projectId:
          filing.projectId === undefined ? undefined : (result.projectId ?? null),
        projectName: result.projectName ?? filing.projectName ?? null,
        researchVerdict:
          filing.researchVerdict === undefined
            ? undefined
            : (result.researchVerdict ?? filing.researchVerdict ?? null),
      });
      setOpen(false);
      onFiled();
    } finally {
      setBusy(false);
    }
  }

  async function fileIntoNewProject() {
    const name = newProject.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      const project = await getReviewTransport().createProject?.(name);
      if (!project) {
        setError("Could not create that Project.");
        return;
      }
      onProjectCreated(project);
      setNewProject("");
      setBusy(false);
      await file({ projectId: project.id, projectName: project.name });
      return;
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="thread-file-open"
        data-testid={`file-thread-${thread.id}`}
        onClick={() => setOpen(true)}
      >
        {filed ? "Refile" : "File"}
      </button>
    );
  }

  return (
    <div className="thread-filing" data-testid="thread-filing">
      <p className="thread-filing-label">
        {thread.kind
          ? `Filed as ${KIND_LABELS[thread.kind]}?`
          : "What is this?"}
      </p>
      <div className="thread-filing-kinds">
        {KIND_DESK_ORDER.map((kind) => (
          <button
            key={kind}
            type="button"
            className={
              thread.kind === kind
                ? "thread-filing-kind guessed"
                : "thread-filing-kind"
            }
            disabled={busy}
            data-testid={`file-kind-${kind}`}
            onClick={() => void file({ kind })}
          >
            {KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      <p className="thread-filing-label">Project</p>
      <div className="thread-filing-projects">
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            className={
              thread.projectId === project.id
                ? "thread-filing-project guessed"
                : "thread-filing-project"
            }
            disabled={busy}
            data-testid={`file-project-${project.id}`}
            onClick={() =>
              void file({ projectId: project.id, projectName: project.name })
            }
          >
            {project.name}
          </button>
        ))}
        {thread.projectId ? (
          <button
            type="button"
            className="thread-filing-project"
            disabled={busy}
            onClick={() => void file({ projectId: null, projectName: null })}
          >
            No project
          </button>
        ) : null}
      </div>

      <div className="thread-filing-new">
        <input
          type="text"
          value={newProject}
          placeholder="New project…"
          aria-label="New project name"
          disabled={busy}
          onChange={(event) => setNewProject(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void fileIntoNewProject();
            }
          }}
        />
        <button
          type="button"
          disabled={busy || newProject.trim().length === 0}
          onClick={() => void fileIntoNewProject()}
        >
          Add
        </button>
      </div>

      {error ? (
        <p className="capture-error" role="alert">
          {error}
        </p>
      ) : null}

      <p className="thread-filing-label">Research</p>
      <div className="thread-filing-verdict">
        {/* The Research Verdict is separate from Reviewed: either choice
            files the Thread, and dismissing retracts its Artifact page. */}
        <button
          type="button"
          className={
            thread.researchVerdict === "kept"
              ? "thread-filing-keep settled"
              : "thread-filing-keep"
          }
          disabled={busy}
          data-testid="file-keep-research"
          onClick={() => void file({ researchVerdict: "kept" })}
        >
          {thread.researchVerdict === "kept" ? "Research kept ✓" : "Keep research"}
        </button>
        <button
          type="button"
          className={
            thread.researchVerdict === "dismissed"
              ? "thread-filing-dismiss settled"
              : "thread-filing-dismiss"
          }
          disabled={busy}
          data-testid="file-dismiss-research"
          onClick={() => void file({ researchVerdict: "dismissed" })}
        >
          {thread.researchVerdict === "dismissed" ? "Dismissed ✓" : "Dismiss"}
        </button>
      </div>

      <div className="thread-filing-actions">
        {/* Sometimes filing is just having read the report. */}
        <button
          type="button"
          className="thread-filing-read"
          disabled={busy}
          data-testid="file-just-read"
          onClick={() => void file({})}
        >
          Just read it
        </button>
        <button
          type="button"
          className="thread-filing-cancel"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
