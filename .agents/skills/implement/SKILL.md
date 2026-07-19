---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Before coding, claim the ticket (`mise run issue:claim -- <n>`) so it carries
`in-progress`. Do not start a ticket that is already claimed. See
`docs/agents/issue-workflow.md`.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Commit your work to the current branch.

When opening the PR, the **body must include** `Closes #<ticket>` (e.g.
`Closes #13`). A title like `(#13)` is not enough — GitHub only auto-closes on
merge when the body uses a closing keyword. Infra/docs PRs with no product
ticket may use `No-ticket: true` instead.
