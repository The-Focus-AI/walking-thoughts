# Operations: production integrations and data handling (#18)

Walking Thoughts is operable and honest about its external dependencies,
security boundaries, offline limits, and provider processing.

## Environment separation

Preview and production use separate resources for every integration — Neon
Postgres, private Vercel Blob, Clerk, Vercel AI Gateway, Tavily web search,
and web push (VAPID). Credentials come exclusively from fnox (`fnox.toml`)
backed by three dedicated 1Password vaults: Development (default profile),
Preview (`--profile preview`), and Production (`--profile prod`). Secrets are
never committed, never logged, and never appear in test fixtures; tests use
placeholder keys and in-memory fakes.

Sync `fnox`-resolved configuration to Vercel with `mise run vercel:sync -- -e
preview|production`.

## Health surface

`GET /api/health` reports every external service without revealing secret
values (`lib/operations/health.ts` + `lib/operations/probes.ts`):

- `database` — Neon round-trip (`SELECT 1`) when `DATABASE_URL` is set
- `objectStorage` — private Vercel Blob configuration
- `clerk` — keys, allowlist, and production origin-locking readiness
- `gateway` — Vercel AI Gateway credential and the selected model
- `queue` — open durable Enrichment job count (or that tables are pending)
- `push` — VAPID key-pair completeness

Every service reports `ok | degraded | error | not_configured` plus a
human-readable, secret-free detail. Overall status is
`configuration_required` (HTTP 503) until Clerk is configured, `degraded`
when any service reports an error, otherwise `ok`.

## Storage boundaries

Original media uploads to Vercel Blob with `access: "private"` under
`media/<userId>/…` (`lib/media/vercel-blob-store.ts`); bytes are served only
through authenticated application routes, so no permanent public media URL
exists. All server records are scoped by `user_id`, and cross-user
identifier checks are locked in by `tests/production-boundaries.spec.ts`
(sync records, media objects, Enrichment history and jobs, push
subscriptions) even though v1 has a single allowed user.

Transport enforces HTTPS via `Strict-Transport-Security` (next.config.ts).

## Smoke tests

`tests/preview-smoke.spec.ts` exercises the real preview instances at low
volume — one Clerk backend API call, a Neon round-trip plus a real-repository
cross-user check, private Blob put/get/delete, one tiny gateway completion,
one web search, and one push send whose VAPID authentication must be accepted
by the push service. Each test skips when its credential is absent, so the
suite passes without secrets. Run them against the preview vault with:

```bash
mise run smoke:preview
```

Full authenticated Clerk E2E coverage lives in `tests/auth.spec.ts` behind
the same skip pattern.

## Disclosure

`/privacy` (linked from the shell footer, cached for offline reading)
explains: local-first Capture durability, dependable foreground vs
best-effort background synchronization, private cloud storage with separate
preview/production resources, the Vercel AI Gateway provider-processing
disclosure with exact-model recording, TLS transport, and the explicit
statement that Walking Thoughts is **not** end-to-end encrypted.
`tests/data-handling.spec.ts` locks the disclosure copy and the HSTS header.
