# Agent issue workflow

GitHub Issues is the authoritative tracker. The parent specification is issue
`#1`; its implementation tickets are native sub-issues with native blocking
relationships. The frontier is the open, unassigned `ready-for-agent` sub-issue
whose blocker count is zero.

Claim a ticket before implementation. Work one ticket per branch, use its public
acceptance criteria as the testing seam, run the repository code review, and
close the ticket only after the deployed behavior is verified.

Vercel deployments are PR-only: push the branch for its Git-integrated Preview,
then merge the approved PR to `main` for Production. Never run a direct Vercel
deployment command.

Labels: `ready-for-agent`, `needs-info`, `needs-triage`, and `wontfix`.
