# Walking Thoughts agent guide

Follow `/Users/wschenk/The-Focus-AI/standards/AGENTS.md` and its relevant
`best-practices` files before tooling, security, deployment, or broad project
changes. Use mise for every project tool, pnpm for JavaScript packages, fnox and
dedicated 1Password vaults for secrets, and Vercel for this Next.js application.
Never deploy to Vercel directly from the CLI. Branch pushes create Preview
deployments through the Git integration; only merging an approved pull request
to `main` may create a Production deployment.

Read `CONTEXT.md`, `docs/adr/`, the originating GitHub ticket, `mise.toml`, and
`fnox.toml` before implementation. Preserve the canonical domain terms Capture,
Inbox, Thread, Enrichment, and Offline Region.

Collaborative plans, specs, reports, proposals, memos, and drafts default to
Proof. Existing repository Markdown remains local unless the user explicitly
asks to move or share it.

Implement one unblocked frontier ticket at a time. Before any implementation,
claim it with `mise run issue:claim -- <n>` so `in-progress` is set — that label
is the multi-agent mutex (see `docs/agents/issue-workflow.md`). Never start a
ticket that already has `in-progress`. Use TDD at the public seams named by the
spec, run typechecking regularly, and run the two-axis code review before
committing. Never commit secrets or weaken authentication to make local
development or tests pass.

Agent PR bodies must include `Closes #<ticket>` (not only `(#N)` in the title)
so merging to `main` auto-closes the issue without needing agent `issues:write`.

## Cursor Cloud specific instructions

`.cursor/environment.json` runs `.cursor/install.sh` on each machine boot. That
script installs mise and the 1Password CLI (`op`), activates mise shims on
`PATH`, runs `mise install`, bootstraps `.fnox/env` when possible, then runs
`mise run install`.

For secret access, add `OP_SERVICE_ACCOUNT_TOKEN` (the Walking Thoughts
project-scoped 1Password service-account token) in the Cursor Cloud Secrets tab
for this environment. The install script writes it to gitignored `.fnox/env`.
Without that token, lint/build/test of public surfaces still work; authenticated
Clerk/fnox flows will not.

Use `mise` for all project tools. Do not run direct Vercel deploy commands.
After dependency changes, prefer `mise run install` / `mise install` rather than
ad-hoc global package managers.
