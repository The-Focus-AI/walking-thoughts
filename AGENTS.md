# Walking Thoughts agent guide

Follow `/Users/wschenk/The-Focus-AI/standards/AGENTS.md` and its relevant
`best-practices` files before tooling, security, deployment, or broad project
changes. Use mise for every project tool, pnpm for JavaScript packages, fnox and
dedicated 1Password vaults for secrets, and Vercel for this Next.js application.

Read `CONTEXT.md`, `docs/adr/`, the originating GitHub ticket, `mise.toml`, and
`fnox.toml` before implementation. Preserve the canonical domain terms Capture,
Inbox, Thread, Enrichment, and Offline Region.

Collaborative plans, specs, reports, proposals, memos, and drafts default to
Proof. Existing repository Markdown remains local unless the user explicitly
asks to move or share it.

Implement one unblocked `ready-for-agent` ticket at a time. Use TDD at the
public seams named by the spec, run typechecking regularly, and run the two-axis
code review before committing. Never commit secrets or weaken authentication to
make local development or tests pass.
