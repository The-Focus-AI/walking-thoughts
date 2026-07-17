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
repository.

## Environments

- Development: `Walking Thoughts - Development` 1Password vault and a Clerk
  development instance.
- Preview: `Walking Thoughts - Preview` vault and the same non-production Clerk
  application.
- Production: `Walking Thoughts - Production` vault and a dedicated Clerk
  production instance with live keys, custom Clerk domain, Dashboard identity
  allowlist, and `CLERK_AUTHORIZED_PARTIES` locked to the production app origin.

Use `mise run vercel:sync -- --env preview` before preview deployment and
`mise run vercel:sync -- --env production` before production deployment. The
task selects the matching fnox profile so credentials cannot cross environment
boundaries. Vercel receives resolved environment variables; fnox does not run
in Vercel builds or functions.

## Verification

```sh
mise lint
mise test
mise deploy
```

The public browser seam verifies the install manifest, active service worker,
offline reload, and secret-safe health response at `/api/health`. When the
preview Clerk keys plus `CLERK_E2E_ALLOWED_EMAIL` and
`CLERK_E2E_DISALLOWED_EMAIL` are present, it also verifies anonymous redirect,
the allowed identity, rejection of a different identity, and offline fallback
after an authenticated load.
