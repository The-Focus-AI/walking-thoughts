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

Implement one unblocked `ready-for-agent` ticket at a time. Use TDD at the
public seams named by the spec, run typechecking regularly, and run the two-axis
code review before committing. Never commit secrets or weaken authentication to
make local development or tests pass.

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

Run/verify commands live in `mise.toml` (`mise run lint|test|build|dev`) and
`README.md`. Two non-obvious runtime notes:

- `mise run test` runs `pnpm test` without `fnox`, so only the public-surface
  seam runs and the authenticated Clerk tests in `tests/auth.spec.ts` skip. To
  run the full authenticated boundary suite, resolve the preview identities:
  `fnox exec --profile preview -- pnpm test`. `mise run dev` already wraps
  `fnox exec` (default vault) and serves at `http://localhost:3000`; anonymous
  requests 307-redirect to `/sign-in` and `/api/health` returns `200` once the
  Clerk secrets resolve.
- The allowed identity is a real email, so manual browser sign-in cannot
  complete the emailed code; the authenticated flow is exercised programmatically
  by the preview-profile Playwright suite via Clerk testing tokens.
