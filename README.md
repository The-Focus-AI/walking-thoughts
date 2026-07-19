# Walking Thoughts

Walking Thoughts is an Android-first PWA for committing mixed-media Captures
offline and enriching complete, append-only Thread history after reconnection.
The current foundation provides an installable offline shell and a fail-closed
Clerk boundary for the single allowed user.

## Start locally

```sh
mise install
mise run setup
mise run install
mise dev
```

The shell is available at `http://localhost:3000`. Without Clerk configuration
it deliberately shows **Secure setup required** and private APIs return `503`.
Declare secrets in 1Password through `fnox.toml`; never put their values in the
repository or a local `.env` file. `mise run setup` retrieves the project-scoped
service-account token from the `thefocus` vault into the protected,
gitignored `.fnox/env` bootstrap file. Interactive shells may use
`fnox activate`; non-interactive commands should use `fnox exec -- <command>`.

## Environments

- Development: `Walking Thoughts - Development` 1Password vault and a Clerk
  development instance.
- Preview: `Walking Thoughts - Preview` vault and the same non-production Clerk
  application.
- Production: `Walking Thoughts - Production` vault and a dedicated Clerk
  production instance with live keys, custom Clerk domain, Dashboard identity
  allowlist, and `CLERK_AUTHORIZED_PARTIES` locked to the production app origin.

Use `mise run vercel:sync -- --env preview` before opening or updating the PR
and `mise run vercel:sync -- --env production` before merging it. The task
selects the matching fnox profile and writes keys into Vercel (`thefocusai` /
`walking-thoughts`) using `VERCEL_TOKEN`. Fnox does not run in Vercel builds or
functions.

Deployments are PR-only. A branch push creates its Preview through Vercel's Git
integration, and merging the approved PR to `main` creates Production. Do not
run `vercel deploy` directly. `mise deploy` validates the application and the
current PR's Preview check; it does not create a deployment.

## Verification

```sh
mise lint
mise test
mise deploy
```

The public browser seam verifies the install manifest, active service worker,
offline reload, and secret-safe health response at `/api/health`. It also
verifies offline text Capture draft recovery, local commit without blocking on
location, durable restart, and quota-failure draft preservation. It also covers
Inbox defaults, sticky Thread destinations, inactivity reset, append-only
corrections, and deterministic Thread ordering. Synchronization covers
idempotent outbox replay, Inbox-to-Thread promotion, and Complete /
Needs attention status. Mixed-media Captures cover local durable
attachments, private media sync, and authenticated media access. Outdoor
Quick Capture adds Type/Audio/Photo/Video dock controls with timed
in-app recording. When the
preview Clerk keys plus `CLERK_E2E_ALLOWED_EMAIL` and
`CLERK_E2E_DISALLOWED_EMAIL` are present, it also verifies anonymous redirect,
the allowed identity, rejection of a different identity, and offline fallback
after an authenticated load.
