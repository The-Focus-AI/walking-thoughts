# Agent issue workflow

GitHub Issues is the authoritative tracker. The parent specification is issue
`#1`; its implementation tickets are native sub-issues with native blocking
relationships.

## Labels

Triage / readiness (at most one readiness label at a time):

| Label | Meaning |
| --- | --- |
| `needs-triage` | Maintainer needs to evaluate |
| `needs-info` | Waiting on the reporter |
| `ready-for-agent` | Fully specified; available for an agent once unblocked and unclaimed |
| `ready-for-human` | Needs a human, not an AFK agent |
| `wontfix` | Will not be actioned |

Claim / concurrency (orthogonal to readiness):

| Label | Meaning |
| --- | --- |
| `in-progress` | **Claimed.** Another agent must not start this ticket |

`mise run issue:ensure-labels` (and `.github/workflows/ensure-issue-labels.yml`)
create these labels if missing.

## Frontier

The frontier is the set of tickets an agent may start. A ticket is on the
frontier when **all** of the following hold:

1. State is `open`
2. It has label `ready-for-agent`
3. It does **not** have label `in-progress`
4. It has no open blockers (`issue_dependencies_summary.blocked_by == 0`, or
   every issue in a body `Blocked by:` line is closed)

Assignee alone is **not** the claim. Cloud agents often cannot assign issues;
`in-progress` is the shared mutex for multiple concurrent agents.

List the frontier:

```bash
mise run issue:frontier
```

## Claim (required before work)

Claim **before** branching, coding, or opening a PR. One agent, one ticket.

```bash
mise run issue:claim -- <issue-number>
```

That command:

1. Confirms the issue is on the frontier (or already claimed by this session)
2. Adds `in-progress` (keeps `ready-for-agent` so readiness history stays clear)
3. Attempts `--add-assignee @me` when the token allows it
4. Re-reads the issue; fails if `in-progress` is missing after the write

If the token cannot write labels (common for some GitHub App installations),
the script exits non-zero and prints the manual / CI fallback. Opening a
`cursor/*` PR that references `#N` then lets
`.github/workflows/agent-ticket-claim.yml` apply `in-progress` and reject a
second concurrent claim on the same issue.

Never start implementation on a ticket that already has `in-progress`.

## While working

- One ticket per branch; branch names stay `cursor/<descriptive-name>-…`
- Reference the claimed issue in the PR title (e.g. `… (#8)`)
- **Put a closing keyword in the PR body** so merge auto-closes the issue:

  ```text
  Closes #8
  ```

  Also accepted: `Fixes #8`, `Resolves #8` (and close/fix/resolve variants).
  A title like `(#8)` alone does **not** close the issue. Cloud Agent tokens
  often lack `issues:write`, so this GitHub-native close-on-merge path is
  required. `.github/workflows/agent-ticket-claim.yml` fails `cursor/*` PRs
  that omit it.
- Use the ticket's public acceptance criteria as the testing seam
- Run the repository two-axis code review before asking for merge

## Release (abandon)

If you stop without finishing:

```bash
mise run issue:release -- <issue-number>
```

Removes `in-progress` and clears the assignee when possible so the ticket
returns to the frontier.

## Resolve (done)

Prefer **merge with `Closes #N` in the PR body**. GitHub closes the issue when
that PR merges to `main`, without needing agent `issues:write`. Verify Preview
behavior before merge when that is the acceptance bar.

Closing ends the claim; do not leave stale `in-progress` labels on closed
issues (GitHub clears the open state; remove leftover labels if they linger).

Vercel deployments are PR-only: push the branch for its Git-integrated Preview,
then merge the approved PR to `main` for Production. Never run a direct Vercel
deployment command.
