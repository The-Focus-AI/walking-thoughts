# Sync fnox secrets into Vercel with a single API token

Walking Thoughts keeps 1Password (via `fnox.toml` profiles) as the source of
truth for Development, Preview, and Production secrets. Vercel Preview and
Production still need those values as project environment variables so the Git
integration can build and run the app.

`mise run vercel:sync` exports the matching fnox profile and writes each key
into the target Vercel environment through the Vercel CLI. Agents and CI
authenticate with one bootstrap credential, `VERCEL_TOKEN`, plus fixed scope
`thefocusai` and project `walking-thoughts`. App secrets are never stored as
Cursor Cloud Secrets; only the service-account token (for fnox) and the Vercel
API token (for sync) are.
