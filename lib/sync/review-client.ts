import type { SpecHandoff } from "@/lib/local-capture/types";
import { trackedFetch } from "@/lib/sync/session-state";
import type { Project } from "./types";

/** What the walker settled about a Thread while filing it. */
export type ThreadFiling = {
  reviewed: boolean;
  kind?: string | null;
  projectId?: string | null;
  /** The Research Verdict: omitted keeps the current one, null clears it. */
  researchVerdict?: "kept" | "dismissed" | null;
  /** The Route: omitted keeps the current one, null clears it. */
  route?: string | null;
};

export type FiledThread = {
  threadId: string;
  reviewedAt: string | null;
  kind?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  researchVerdict?: "kept" | "dismissed" | null;
  route?: string | null;
  /** What routing to Spec did outside the system (ADR 0018). */
  specHandoff?: SpecHandoff | null;
};

export type ReviewTransport = {
  setReviewed(
    threadId: string,
    reviewed: boolean,
  ): Promise<{ threadId: string; reviewedAt: string | null } | null>;
  fileThread?(
    threadId: string,
    filing: ThreadFiling,
  ): Promise<FiledThread | null>;
  listProjects?(): Promise<Project[] | null>;
  createProject?(
    name: string,
    repository?: string | null,
  ): Promise<Project | null>;
};

type ReviewGlobals = typeof globalThis & {
  __WT_REVIEW_TRANSPORT__?: ReviewTransport;
};

function defaultTransport(): ReviewTransport {
  const headers = (): HeadersInit => {
    const result: Record<string, string> = {
      "content-type": "application/json",
    };
    const testUser = process.env.NEXT_PUBLIC_SYNC_TEST_USER_ID;
    if (testUser) {
      result["x-walking-thoughts-test-user"] = testUser;
    }
    return result;
  };

  return {
    async setReviewed(threadId, reviewed) {
      try {
        const response = await trackedFetch("/api/sync/review", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ threadId, reviewed }),
        });
        if (!response.ok) return null;
        return (await response.json()) as {
          threadId: string;
          reviewedAt: string | null;
        };
      } catch {
        return null;
      }
    },

    async fileThread(threadId, filing) {
      try {
        const response = await trackedFetch("/api/sync/review", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ threadId, ...filing }),
        });
        if (!response.ok) return null;
        return (await response.json()) as FiledThread;
      } catch {
        return null;
      }
    },

    async listProjects() {
      try {
        const response = await trackedFetch("/api/sync/projects", {
          headers: headers(),
        });
        if (!response.ok) return null;
        const body = (await response.json()) as { projects?: Project[] };
        return body.projects ?? [];
      } catch {
        return null;
      }
    },

    async createProject(name, repository) {
      try {
        const response = await trackedFetch("/api/sync/projects", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(
            repository === undefined ? { name } : { name, repository },
          ),
        });
        if (!response.ok) return null;
        const body = (await response.json()) as { project?: Project };
        return body.project ?? null;
      } catch {
        return null;
      }
    },
  };
}

export function getReviewTransport(): ReviewTransport {
  return (
    (globalThis as ReviewGlobals).__WT_REVIEW_TRANSPORT__ ?? defaultTransport()
  );
}
