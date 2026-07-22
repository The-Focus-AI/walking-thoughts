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

## Pull requests and ticket close-out

When opening or updating a PR for a product ticket:

1. Put the ticket in the **title** (e.g. `… (#13)`).
2. Put a **closing keyword in the PR body** on its own line:

   ```text
   Closes #13
   ```

   Also accepted: `Fixes #13`, `Resolves #13` (and close/fix/resolve variants).
3. Do **not** rely on `(#13)` in the title alone — that does not close the issue.
4. Infra/docs PRs with no product ticket may set `No-ticket: true` on its own
   line in the body instead.

Cloud Agent tokens often lack `issues:write`. Merging to `main` with
`Closes #<n>` is how tickets get closed. CI
(`.github/workflows/agent-ticket-claim.yml`) fails `cursor/*` PRs that omit it.
Details: `docs/agents/issue-workflow.md`.

## Reaching the databases and other secrets

`OP_SERVICE_ACCOUNT_TOKEN` in the session environment is the entry point to
every secret, including the Neon `DATABASE_URL`. Do not ask the human for
credentials; resolve them yourself:

1. `mise run setup` — pulls bootstrap tokens into gitignored `.fnox/env`.
2. `fnox exec --profile <profile> -- <command>` — runs a command with that
   environment's secrets resolved from its 1Password vault: `default`
   (Development), `preview`, or `prod` (Production).

Example — run a maintenance script against the Production database:

```sh
mise run setup
fnox exec --profile prod -- node scripts/split-grouped-threads.mjs
```

Production data changes must dry-run first, print exactly what will change,
and only write behind an explicit `--apply`-style flag. Never print secret
values; `fnox exec` keeps them out of the transcript.

## Cursor Cloud specific instructions

`.cursor/environment.json` runs `.cursor/install.sh` on each machine boot. That
script installs mise and the 1Password CLI (`op`), activates mise shims on
`PATH`, runs `mise install`, bootstraps `.fnox/env` when possible, then runs
`mise run install`.

Add these in the Cursor Cloud Secrets tab for this environment (written into
gitignored `.fnox/env`):

- `OP_SERVICE_ACCOUNT_TOKEN` — Walking Thoughts 1Password service-account token
  (required for fnox vault reads)
- `VERCEL_TOKEN` — Vercel token with env write on `thefocusai/walking-thoughts`
  (required for `mise run vercel:sync`; may also live as a Development vault
  Password item titled `VERCEL_TOKEN`)

Without `OP_SERVICE_ACCOUNT_TOKEN`, lint/build/test of public surfaces still
work; authenticated Clerk/fnox flows will not. Without `VERCEL_TOKEN`, agents
cannot push fnox secrets into Vercel Preview/Production env vars.

Use `mise` for all project tools. Do not run direct Vercel deploy commands.
After dependency changes, prefer `mise run install` / `mise install` rather than
ad-hoc global package managers.

Every product-ticket PR body must include `Closes #<n>` (see above). Prefer that
over asking the human to close issues, and over attempting `gh issue close`
when the token lacks permission.
