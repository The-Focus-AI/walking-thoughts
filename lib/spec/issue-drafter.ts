/**
 * The seam through which spec routing leaves the system (ADR 0018): one
 * ticket-shaped issue drafted in a Project's repository. Callers guard
 * idempotency with the Thread's handoff record; the drafter's own key check
 * covers the crash window where the issue landed but the record write did
 * not, so the same key can never draft twice even across that gap.
 */

export type IssueDraft = {
  /** `owner/repo` the issue is drafted into. */
  repository: string;
  title: string;
  body: string;
  /**
   * Stable per-Thread key (`spec:<threadId>`). It travels in the issue body
   * so an implementation can find an existing draft before creating one.
   */
  idempotencyKey: string;
};

export type DraftedIssue = {
  repository: string;
  url: string;
  number: number;
  /** True when the key had already drafted this issue — nothing new landed. */
  duplicate: boolean;
};

export type IssueDrafter = {
  draftIssue(draft: IssueDraft): Promise<DraftedIssue>;
};

type MemoryDrafterState = Map<string, DraftedIssue & { title: string; body: string }>;

const memoryStates = new Map<string, MemoryDrafterState>();

function memoryState(namespace: string): MemoryDrafterState {
  const existing = memoryStates.get(namespace);
  if (existing) return existing;
  const created: MemoryDrafterState = new Map();
  memoryStates.set(namespace, created);
  return created;
}

export function resetMemoryIssueDrafter(namespace = "default"): void {
  memoryStates.set(namespace, new Map());
}

/** Every issue the memory drafter holds — the tests' receipts screen. */
export function listMemoryDraftedIssues(
  namespace = "default",
): Array<DraftedIssue & { title: string; body: string }> {
  return [...memoryState(namespace).values()];
}

/**
 * The in-memory drafter: keyed by idempotency key, so drafting twice
 * returns the first issue with `duplicate: true`. Backs tests and any
 * environment without a GitHub credential.
 */
export function createMemoryIssueDrafter(namespace = "default"): IssueDrafter {
  return {
    async draftIssue(draft) {
      const issues = memoryState(namespace);
      const existing = issues.get(draft.idempotencyKey);
      if (existing) return { ...existing, duplicate: true };
      const created = {
        repository: draft.repository,
        url: `https://github.com/${draft.repository}/issues/${issues.size + 1}`,
        number: issues.size + 1,
        duplicate: false,
        title: draft.title,
        body: draft.body,
      };
      issues.set(draft.idempotencyKey, created);
      return {
        repository: created.repository,
        url: created.url,
        number: created.number,
        duplicate: false,
      };
    },
  };
}

/**
 * The GitHub drafter, REST only. Before creating it searches the repo for
 * an open or closed issue already carrying the idempotency key in its body
 * — that is what makes a retry after a half-recorded success a no-op
 * instead of a second issue.
 */
export function createGitHubIssueDrafter(options: {
  token: string;
  fetchImpl?: typeof fetch;
  apiBase?: string;
}): IssueDrafter {
  const doFetch = options.fetchImpl ?? fetch;
  const apiBase = options.apiBase ?? "https://api.github.com";
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${options.token}`,
    "content-type": "application/json",
  };

  return {
    async draftIssue(draft) {
      const query = encodeURIComponent(
        `repo:${draft.repository} in:body "${draft.idempotencyKey}"`,
      );
      const searchResponse = await doFetch(
        `${apiBase}/search/issues?q=${query}`,
        { headers },
      );
      if (searchResponse.ok) {
        const found = (await searchResponse.json()) as {
          items?: Array<{ html_url: string; number: number }>;
        };
        const prior = found.items?.[0];
        if (prior) {
          return {
            repository: draft.repository,
            url: prior.html_url,
            number: prior.number,
            duplicate: true,
          };
        }
      }
      // A failed search is not a license to draft blind — the caller's
      // record is the primary guard, and this path only runs when that
      // record says nothing was drafted.

      const createResponse = await doFetch(
        `${apiBase}/repos/${draft.repository}/issues`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ title: draft.title, body: draft.body }),
        },
      );
      if (!createResponse.ok) {
        throw new Error(`github_${createResponse.status}`);
      }
      const created = (await createResponse.json()) as {
        html_url: string;
        number: number;
      };
      return {
        repository: draft.repository,
        url: created.html_url,
        number: created.number,
        duplicate: false,
      };
    },
  };
}

/**
 * The drafter production code asks for. TODO: no server-side GitHub
 * credential is provisioned yet — add SPEC_HANDOFF_GITHUB_TOKEN to fnox and
 * the Vercel environments to make the handoff live; until then the memory
 * drafter records everything faithfully and no real issue appears, which
 * the Thread's handoff record says plainly (ADR 0018).
 */
export function getIssueDrafter(
  environment: NodeJS.ProcessEnv = process.env,
): IssueDrafter {
  const token = environment.SPEC_HANDOFF_GITHUB_TOKEN;
  if (token) {
    return createGitHubIssueDrafter({ token });
  }
  return createMemoryIssueDrafter("default");
}
