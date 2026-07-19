# Harden integrations and disclose processing honestly

Production, preview, and development each use separate Clerk, Neon, private Vercel Blob, Vercel AI Gateway, VAPID push, and Neon-backed Enrichment job resources, sourced from the matching fnox / 1Password vault and synced with `mise run vercel:sync`.

`GET /api/health` reports ready/missing/error for those services plus transport flags without embedding secret values. Low-volume preview smokes (`PREVIEW_SMOKE=1`) exercise isolated preview instances when secrets are present and otherwise skip.

The product discloses that synchronized content is processed through Vercel AI Gateway by the selected provider and does not claim end-to-end encryption. Foreground sync while the app is open is the dependable path; closed-application background work stays best effort. Offline messaging must never imply that a locally committed Capture was lost because a remote step is unavailable.
