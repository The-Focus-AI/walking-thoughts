---
number: "014"
title: "Progressive web apps"
kind: guide
issued: "2026-08-29"
author: W. Schenk
status: Current
verified: "2026-08-29"
---

> Distilled by a cloud agent from the full history of
> The-Focus-AI/walking-thoughts — 210 commits, 19 ADRs, and the merged PR
> record — with every claim cited to the commit or decision that taught it.
> Companion guide: GDE-015 covers the offline-first data layer; this one
> covers the app as a phone artifact — installability, the service worker,
> weak-signal navigation, device capabilities, and mobile layout.

# Progressive web apps

Canonical pattern for shipping an installable PWA on Next.js, learned
Android-first (Chrome on a Pixel 9, per walking-thoughts ADR 0002). The frame
that ADR set holds for new projects: v1 is an installable PWA, foreground
behavior while the app is open is the dependable path, background work while
the app is closed is best-effort only, and a native wrapper is reserved for
limitations found on the real device — none were.

Reference implementation: **walking-thoughts** — `app/manifest.ts`,
`public/sw.js`, `lib/offline-shell.ts`, `components/install-app-prompt.tsx`,
`components/service-worker-register.tsx`, `lib/net/timeout.ts`,
`lib/local-capture/recording.ts`, `lib/local-capture/location.ts`.

## Defaults

| Concern | Standard |
| --- | --- |
| Manifest | Typed `app/manifest.ts` (`MetadataRoute.Manifest`), served at `/manifest.webmanifest` |
| App identity | `id` pinned in the manifest from day one |
| Icons | Real PNGs at exactly 192 and 512 with `purpose: "any"`, plus a 512 `maskable` |
| Service worker | Hand-written `public/sw.js` with a versioned shell cache; no Workbox |
| SW registration | Client component in the **root** layout, `scope: "/"` |
| Install UX | In-app `beforeinstallprompt` button, with literal browser-menu steps as fallback |
| Headers | `next.config.ts`: `sw.js` served `no-cache, no-store, must-revalidate`; app-wide `Permissions-Policy` granting self camera/mic/geolocation |
| Network | Every fetch has a deadline; `navigator.onLine` is only trusted when it says offline |
| Testing | Playwright device-sized project, `serviceWorkers: "allow"`, against a production build |

## Installability

Chrome's installability check fails silently — it never says which criterion
you missed. Every rule below was discovered by shipping a build that did not
install, so encode each one as a test assertion the way
`tests/foundation.spec.ts` does.

**Icons: a maskable-only 512 does not count.** Chrome's "Install app" needs a
192 *and* a 512 with `purpose: "any"`; maskable satisfies adaptive home-screen
icons but not the install check. List the 512 twice, once `any` and once
`maskable`, and use real PNGs at exactly those pixel sizes, not SVGs
(walking-thoughts `eede3b6`, `63dd927`).

**Pin `id` in the manifest on day one.** Without `id`, Chrome derives app
identity from `start_url`, and anything that changes how the app is reached
can strand a phantom install: the browser holds a record of an "installed"
app the launcher has no icon for, and it never fires `beforeinstallprompt`
for an app it believes is already there. Retrofitting `id` later does not
repair devices already stranded — walking-thoughts had to ship in-product
recovery instructions (uninstall via Android app settings, then clear the
site in Chrome settings) because no server-side fix exists
(walking-thoughts `9bb3908`).

**Register the service worker from the root layout.** Installability requires
an active service worker with a fetch handler on first load — including the
sign-in page. Registration that lives inside the authenticated shell means a
visitor who never signs in never becomes installable. A tiny `"use client"`
component doing `navigator.serviceWorker.register("/sw.js", { scope: "/" })`
in the root layout fixes it; keep cache-warming separate, it is a different
job (walking-thoughts `eede3b6`).

**Ship your own install button.** Even with every check green, Chrome
frequently never surfaces "Install app" — dismiss cooldowns, engagement
heuristics, menu burying. Capture `beforeinstallprompt`
(`preventDefault()`, stash the event), offer a one-tap Install that calls
`prompt()`; hide on `appinstalled`; detect installed state via
`matchMedia("(display-mode: standalone)")`. When the event never fires, fall
back to literal menu steps in the UI, including "stay on this page about half
a minute after signing in" — engagement heuristics restart on the
authenticated origin (walking-thoughts `cbbd1e5`).

**Scrutinize an authenticated `start_url` at design time.** A `start_url`
that answers a signed-out 307 to `/sign-in` is a latent hazard: the service
worker refuses to cache redirected responses, so an installed app launching
there can fail offline. Walking-thoughts kept `start_url: "/"` because the
test suite pins it as a deliberate contract and there was no evidence the
redirect suppressed installation — the recorded lesson is both halves: audit
the redirect, and never change a pinned decision on a guess.

## The service worker

Walking-thoughts runs ~170 hand-written lines in `public/sw.js` — no Workbox,
no build step. For a small app that keeps every behavior inspectable and
trivially diffable; the price is manual cache versioning, and the lessons
below are what manual versioning costs.

**Cache freshness must not be coupled to service-worker updates.** A deploy
that leaves `sw.js` byte-identical never reinstalls the worker, so
install-time precaching alone strands installed phones on the old build's
HTML forever. The field failure was severe: an offline walk ran the previous
build's JavaScript and silently applied a retired data model to new records
(walking-thoughts `3aae84c`, PR 76). Every successful online navigation for
a shell path re-`put`s the response into the cache, and shape changes still
bump the version constant (`walking-thoughts-shell-v14` today), with
`skipWaiting()` and `clients.claim()` so updates land without a second visit.

**Precache individually; refuse redirected responses.** `cache.addAll` is
all-or-nothing, so one signed-out 307 on an authenticated shell page fails
the whole install — and a redirected response stored in the cache cannot
legally answer a navigation later, poisoning it. Precache with
`Promise.allSettled` over per-path fetches and only
`cache.put` when `response.ok && !response.redirected`
(walking-thoughts `81c7f6c`).

**Cached Next.js HTML without its chunks is dead markup.** A precached App
Router page whose `/_next/static` chunks were never fetched paints and then
fails to hydrate offline. After caching shell pages, crawl each cached HTML
body for `/_next/static/...` paths and cache those too
(`lib/offline-shell.ts`); also opportunistically cache any `/_next/static/`
request at runtime — hashed immutable names make that safe
(walking-thoughts `81c7f6c`).

**Precache every navigation destination, and test them all offline.** The
tab that dead-ends offline is the one that was never in the shell list
(`/interview`, PR 110). Derive the precache list from the literal set of tab
destinations plus the manifest, icons, and self-hosted fonts, and keep a
regression test that drives every tab in airplane mode.

**Navigations get a deadline inside the worker too.** Network-first must not
mean network-forever: a one-bar connection passes every online check and then
stalls. Walking-thoughts gives navigations 3.5 s via `AbortController` before
serving the cached shell (walking-thoughts `81c7f6c`).

**Fall back to the right room.** An offline deep link with no cached copy of
its own (`/days/<key>`, `/threads/<id>`) should land on its section's cached
workspace shell, not the app root or a generic offline page — the wrong
surface reads as data loss (walking-thoughts `f80e7a4`, PR 116).

**Keep auth out of the worker's cache.** The worker only caches public shell
assets and `/_next/static`; authenticated page HTML is warmed client-side
after sign-in (same cache name, the user's cookies), so a signed-out redirect
can never become the cached shell. Serve `sw.js` itself with
`Cache-Control: no-cache, no-store, must-revalidate` from `next.config.ts` so
version bumps deploy instantly, and make sure the auth middleware matcher
exempts `manifest.webmanifest`, `sw.js`, and static assets.

## Navigating under weak signal

The most transferable finding in the repo: **`navigator.onLine === false`
only detects airplane mode.** One bar of real signal passes every online
check and then every fetch hangs indefinitely. Offline is the easy case;
design for "connected but stalled."

- **Every client fetch gets a deadline, budgeted by shape.**
  `fetchWithTimeout` via `AbortSignal.timeout()`: 20 s JSON, 75 s model asks,
  120 s media/export, 10 s weather. A stalled request aborts into the same
  local-first fallbacks as being offline (walking-thoughts `2fe9a75`).
- **The Next.js client router's navigation fetch has no deadline.** A tap can
  hang forever with nothing on screen. Offline, skip the router and
  `window.location.assign` immediately — a full navigation the service worker
  answers from cache. Online, arm a 3 s watchdog that a landed route change
  disarms, else fall back to full navigation. Wire the hook to *every*
  workspace link, not just the tab bar — the field report was "I tap a day on
  my phone and nothing happens" (walking-thoughts `81c7f6c`, `f80e7a4`).
- **Paint from local state first; never gate first paint or an empty state on
  the network.** Render immediately from the local store, refresh in the
  background, guard with a load-generation counter so stale refreshes never
  clobber newer state, and only show the empty state after the first
  *completed local* load (walking-thoughts `6d88c57`).
- **Add `loading.tsx` to heavy routes** so a tap answers instantly; perceived
  latency is part of offline resilience.
- **A refused session must not look like a slow network.** Collapsing
  401/403/503 into one silent "unavailable" retried forever while an expired
  session looked exactly like bad signal. Track session-refused apart from
  offline and say "Sign in to sync"; a 5xx says nothing about the session
  (walking-thoughts `c171535`).

## Device capabilities

**MediaRecorder.** Negotiate the container with
`MediaRecorder.isTypeSupported` (`audio/webm` then `audio/mp4`; Chrome is
webm, Safari mp4), always stop every track on stop *and* abort, enforce hard
duration limits with a timer, and derive the file extension from the actual
blob type. Inject `mediaDevices` / the recorder constructor / the clock as
dependencies so tests can fake them (walking-thoughts `b7b5e33`).

**Hold-to-record** is pointer events plus pointer capture plus three CSS
properties. `setPointerCapture` so the release lands on the button when the
thumb drifts; keyboard parity on Space/Enter; a ≥250 ms press means hold-mode
and a completed hold under 1 s is discarded as a slipped thumb. The button
needs `touch-action: none`, `-webkit-touch-callout: none`, and
`user-select: none` — otherwise a long press selects text or opens the
context menu instead of recording (walking-thoughts `085690c`). And never
time gesture tests with the wall clock: a loaded CI machine stretched a
300 ms tap past the 1 s bar; drive `page.clock` instead
(walking-thoughts `41242d7`).

**Camera on Android web** is `<input type="file" accept="image/*"
capture="environment">` for direct camera, a separate multiple-accept input
for the gallery, and `input.value = ""` after every pick so re-selecting the
same file re-fires `change`.

**Know what will consume your recordings before choosing capture formats.**
Walking-thoughts shipped audio capture, then discovered no gateway language
model reads audio at all — all 204 accepted text/image/pdf only, and the two
entries claiming audio were wrong. The full account is in GDE-015; the PWA
lesson is that the capture format decision is a pipeline decision, not a UI
one (walking-thoughts ADR 0015).

**Geolocation.** On a phone that just stepped outside, the *first* GPS probe
always times out — never latch a failed probe as final. Only an explicit
permission denial (`error.code === 1`) is permanent; keep two budgets (300 ms
for silent background probes, 15 s for an explicit user-gesture request — a
cold satellite fix takes that long), refresh a fix once it goes stale, and
keep your own timer beside the API's `timeout` option because the GPS stack
can simply never call back (walking-thoughts `8e849f5`). The permission
prompt needs a user gesture, so make the "GPS off" indicator a button — the
tap is the gesture, a remembered soft denial is cleared because a tap means
"ask again," and a hard block gets copy saying *where* to allow it. And the
first fix races the map mount: keep the latest fix in a ref and draw from
whichever finishes last (walking-thoughts `a8cedfd`).

**Fix-derived data (weather) wants:** fetch after the fix lands, cache with a
TTL and a coordinate tolerance, serve the cache offline but always refresh
online, a tight timeout, and absence rendered as absence rather than error
(walking-thoughts `f0c58da`, `52cf7e8`).

## Viewport and mobile layout

- **The `min-width: auto` trap caused sideways scrolling three separate
  times.** Unbreakable tokens — camera filenames are the canonical case —
  pin flex and grid boxes wider than the phone. The recipe:
  `min-width: 0` on flex children, `minmax(0, 1fr)` for grid tracks,
  `overflow-wrap: anywhere` on user-supplied text, let toolbars wrap, and a
  360 px-viewport regression test asserting no horizontal overflow
  (walking-thoughts `86e8d19`, `5933207`, `8452252`).
- **Standalone layout** is `100svh` (never `100vh`),
  `env(safe-area-inset-*)` in paddings, the tab-bar height as a variable
  that includes the bottom inset, and `viewportFit: "cover"` in the Next
  `Viewport` export beside `themeColor`.
- **A single dropped brace silently killed every CSS rule after it** — the
  build passed, pages served 200, suites were green, and a whole surface
  shipped unstyled. With one large global stylesheet, guard it: a test that
  strips comments and strings, asserts brace depth returns to zero, and
  asserts named surface selectors sit at nesting depth 0. CSS is the one
  layer with no type checker; HTTP 200s and passing suites are both blind to
  a dead stylesheet (walking-thoughts `a1685f4`, PR 172).
- **Pin computed styles in tests after a specificity fight.** A card-wide
  button rule outranked a chip's single-class reset and turned a status chip
  into a giant gold button; scope the exception higher and pin the computed
  background in the e2e test so it cannot re-resolve silently
  (walking-thoughts `84c67ac`).
- **Deliberate swipe detection needs thresholds** (≥64 px travel, horizontal
  dominance ≥1.5× vertical, multi-touch never navigates), sticky docks
  steal phone screen (prefer in-flow), and third-party map widgets have
  mobile-hostile defaults you will need to override (attribution
  auto-expansion, compass chrome).

## Auth in a PWA

Auth interacts with every PWA mechanism; audit each pairing explicitly.
Register the worker on the sign-in page. Precache must tolerate signed-out
redirects. The authenticated shell is client-warmed after sign-in.
`start_url` behind auth is an install and offline hazard. Session-refused is
visibly distinct from offline. Preview deployments need the request origin in
Clerk's `authorizedParties` or sign-in loops between `/` and `/sign-in` —
and since Vercel previews are how you test on a real phone, that bug blocks
all device testing (walking-thoughts `1db6fa4`; GDE-002 for Clerk rules).

## Web push

Push rides the same `sw.js`: a `push` handler that merges `event.data.json()`
into defaults defensively, and a `notificationclick` that focuses an existing
window before opening a new one. Ask for permission only after the user has
gotten value — walking-thoughts offers after the first sync that actually
synced something, once per device, never when permission is already decided
(walking-thoughts `4d44641`). VAPID keys are ordinary secrets under STD-007;
a deploy that silently lacks them is a real failure mode.

## Storage

Call `navigator.storage.persist()` early — Chrome grants it more readily to
installed PWAs, a quiet reason install matters — and tell the user the truth
about the answer: persisted, not guaranteed, or unsupported. Quota failures
preserve the draft (walking-thoughts `16b01a4`).

## Testing

What made everything above stick: a Playwright project at the target device
viewport (Pixel-sized, 412×915) as the primary target,
`serviceWorkers: "allow"` (Playwright's routing can bypass workers
otherwise), run against a production build. Recurring patterns worth
copying: airplane mode is one online visit to warm the shell then
`context.setOffline(true)` across every tab; one-bar is stalling every
`_rsc` route-payload fetch forever and asserting taps still land; manifest
and icon contracts asserted on every run; computed-style pins; `page.clock`
for gestures; the 360 px overflow test. And accept that some states are
unreachable by tests — the stranded-install state cannot be reproduced in CI
or fixed server-side, so the shipped answer is recovery copy in the product.

## Anti-patterns

- A maskable-only 512 icon, SVG icons, or icons not at exact pixel sizes.
- No manifest `id` (identity drifts with `start_url`; installs strand).
- Service-worker registration inside the authenticated shell.
- Waiting for Chrome to offer install instead of shipping an install button.
- `cache.addAll` for shell precache; caching redirected responses.
- Precaching page HTML without its `/_next/static` chunks.
- Coupling shell-cache freshness to service-worker reinstall.
- Trusting `navigator.onLine === true`; any fetch without a deadline.
- Router-only navigation with no hard-navigation fallback.
- Treating 401/403 like a network failure and retrying forever.
- Latching one failed GPS probe as a permanent denial.
- Recording buttons without `touch-action: none` and pointer capture.
- `100vh` layouts and ignored safe-area insets in standalone display.
- Desktop-viewport-only tests, or Playwright with service workers blocked.

## New project checklist

- [ ] `app/manifest.ts`: `id`, `start_url`, `scope`, `display: standalone`,
      theme/background colors, 192 + 512 `any` PNGs + 512 `maskable`
- [ ] Worker registered from the root layout; shell cache named and versioned
- [ ] Per-path precache, redirect-safe; online visits refresh the shell
- [ ] Shell HTML crawled for `/_next/static` chunks
- [ ] Navigation deadline in the worker; section-shell offline fallbacks
- [ ] `sw.js` headers (`no-store`), `Permissions-Policy`, middleware exempts
      manifest/worker/static
- [ ] `fetchWithTimeout` budgets; router watchdog hook on every internal link
- [ ] Install button with `beforeinstallprompt` + menu-steps fallback
- [ ] `navigator.storage.persist()` requested and reported honestly
- [ ] Device-viewport Playwright project, `serviceWorkers: "allow"`,
      production build; airplane-mode tab sweep; 360 px overflow test;
      manifest contract test
