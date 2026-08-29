---
number: "015"
title: "Offline-first applications"
kind: guide
issued: "2026-08-29"
author: W. Schenk
status: Current
verified: "2026-08-29"
---

> Distilled by a cloud agent from the full history of
> The-Focus-AI/walking-thoughts — 210 commits, 19 ADRs, and the merged PR
> record — with every claim cited to the commit or decision that taught it.
> Companion guide: GDE-014 covers the PWA packaging (manifest, service
> worker, weak-signal navigation); this one covers the data architecture —
> local commit, sync, retries, multi-device convergence, and pre-downloaded
> data.

# Offline-first applications

Canonical pattern for applications where the user's work commits on the
device first and the network is an enhancement. Learned on walking-thoughts:
a Capture (text, photo, audio, video plus time and location) commits to
IndexedDB before any remote work, joins an append-only Thread, drains
through an outbox to Neon Postgres, and is enriched by an AI pipeline —
with trail-map packs (Offline Regions) downloaded in advance.

Reference implementation: **walking-thoughts** — `lib/local-capture/`
(store, transitions, persistence), `lib/sync/` (cycle, hydrate, client,
session-state), `lib/enrichment/` (process, failures, recover),
`lib/offline-region/`, ADRs 0001, 0003, 0007, 0009, 0010, 0011, 0015.

## Defaults

| Concern | Standard |
| --- | --- |
| Local store | IndexedDB, raw API; separate databases for records, media blobs, and map packs |
| Commit | Atomic local write with client-generated UUID + ISO timestamp; UI clears only after durable success |
| History | Append-only; corrections are new entries, never rewrites |
| Item lifecycle | `saved_locally → syncing → enriching → complete \| needs_attention`, always visible |
| Sync | One serialized foreground cycle: hydrate → recover → outbox (media, then metadata, then processing) |
| Idempotency | Every network mutation carries a key; the natural key is the entity id |
| Retries | Permanent failures named explicitly; attempt cap as backstop; auto-retry never; retry is a user gesture |
| Conflicts | Device owns unsynced content; server owns settled placement — no CRDTs needed |
| Schema | Idempotent `ensure()` migrations; retired columns keep their history |
| Pre-downloaded data | Verified manifests, staged activation, installed-marker written last |

## The local commit

**Local durable commit is the founding invariant; remote work never owns
the data.** Every entry is committed to IndexedDB before synchronization
begins, and starting or failing remote work never deletes local content
(ADR 0003). The details that make it real: a client-generated UUID and
timestamp at commit time; the composer clears only after the durable write
succeeds; a quota or write failure preserves the draft and never leaves a
partial record; location is prefetched and never blocks commit. Even
uncommitted draft text persists continuously with a save-generation guard
(walking-thoughts `16b01a4`).

**Report persistence honestly.** Request `navigator.storage.persist()` and
surface the actual answer — persisted, not guaranteed, unsupported — rather
than claiming durability the browser did not grant.

**Status copy must never imply committed data was lost because a remote
step failed** (ADR 0009). This one sentence shaped every status string in
the app.

**Prefer the cheapest offline write path.** Capture-time routing (an Inbox
holding "unassigned" entries for later filing) solved a problem field use
showed did not exist, at the cost of a holding place, an assignment step,
and a second lifecycle. Committing straight into the terminal structure —
every Capture starts its own Thread — removed all three; the rare relation
is handled at review time (ADR 0011).

## Append-only history and frozen processing basis

Append-only history plus a **basis frozen at queue time** makes asynchronous
processing deterministic and race-free: each processing job records the
revision, entry ids, and full history it ran against, so later appends never
retroactively change a result (ADR 0001, walking-thoughts `c4facea`).

Two refinements learned in production:

- **Freeze the derived form, not the raw field.** Frozen history carried
  `capture.text`, so an audio-only entry reached the model as an empty line
  and every earlier recording on the thread was silent to follow-up jobs.
  Freeze the single derived reader (`captureWords()`: typed text wins, the
  transcript speaks when there is none) (walking-thoughts `86f7839`).
- **Retire by ceasing writes, not dropping columns.** When measurement cut
  four fields from the processing contract, the columns stayed in place
  holding their history so a reversal finds them where it left them
  (walking-thoughts `8452252`, ADR 0019).

## Visible processing state

Every item carries one visible five-state lifecycle —
`saved_locally / syncing / enriching / complete / needs_attention` — with a
failure reason and a retryability flag, so successful capture is
independently verifiable instead of an act of trust (ADR 0003).

- **Transport throws mark `needs_attention` instead of wedging forever**
  (ADR 0010).
- **Do not lie in the status pill.** "Syncing 111…" when 111 items were
  queued for AI processing read as "my data is at risk"; count the pipelines
  separately (walking-thoughts `015c4e2`).
- **If two store implementations exist (memory for tests, IndexedDB for
  production), extract the domain rules into pure transition functions
  early** — otherwise a rule fixed in one store silently stays broken in the
  other. Walking-thoughts moved every rule into pure transitions over
  `{ captures, threads, trash }` with zero observable behavior change
  (walking-thoughts `93dd689`).

## The sync cycle

Ad-hoc per-screen sync was the original sin: home-composer-only, blind to
abandoned `syncing` states, able to push metadata before media — phone
outboxes wedged forever (walking-thoughts `8bbeb80`, PR 59). The replacement
is **one owned, serialized, ordered cycle** (ADR 0010):

1. **Hydrate** — pull server state, import records missing locally.
2. **Recover** — abandoned or stale local items re-enter sync or processing.
3. **Outbox** — media upload, then record metadata, then processing.

Kept alive on authenticated screens by a shell-level runtime (every 12 s
plus `online` and `visibilitychange`), serialized behind one global
in-flight promise so no two callers race the same IndexedDB.

- **Gate metadata on media.** A record with unsynced local blobs must not
  push metadata first, or the server holds a record referencing bytes that
  may never arrive.
- **Recovery sweeps are part of the cycle, because outboxes will strand
  items.** Two real classes: records marked complete that the server never
  durably had (a server on its in-memory fallback acknowledged work that
  evaporated on redeploy), and "orphan completes" whose processing never
  covered them. Track coverage explicitly (target ids on each processing
  result) so both are detectable (walking-thoughts `df8e9e9`).
- **Distinguish unavailable from failed in the transport.** 401/403/503
  restore the item to the outbox quietly; real HTTP errors become
  `needs_attention` with `retryable: status >= 500`.
- **A refused session is not a weak signal.** Collapsing 401 into a silent
  retry loop made an expired session look exactly like bad coverage — the
  phone kept posting, the server kept refusing, nothing said so. Track
  session-refused apart from offline; a 5xx or timeout says nothing about
  the session and leaves the flag alone (walking-thoughts `c171535`).

## Idempotency

Every mutation crossing the network carries an idempotency key, enforced
server-side (`UNIQUE (user_id, idempotency_key)`); the natural key is
usually the entity id. Record upserts key on the record id; media uploads on
the attachment id with a `duplicate` flag in the answer; trash and restore
ride an operations ledger whose replay returns the recorded result; purge
operations bucket their ids by UTC day so duplicate deliveries stay
idempotent without touching unrelated objects (walking-thoughts `ba3d4bd`,
`9046317`, `cd448a0`).

**Scope keys to what makes a retry meaningful.** The refined scheme
(walking-thoughts `b07de18`, `62f7fab`): a thread's processing key is stable
(`enrich:<id>:r<rev>`) so a model change never re-runs work that already
succeeded — but an item stuck behind a *permanent* failure under an old
model gets exactly one fresh job keyed by the new model, and one stuck
behind a since-replaced transcription model gets one keyed by the new
transcription model. Config changes unlock exactly one recovery instead of
one per cycle.

## Retry discipline and bounded work

The hardest-won lessons in the repo, all from production retry storms:

- **Name permanent failures explicitly or retries grind forever.** One job
  with deleted source media reached ~6,400 attempts; one whose model could
  not read its media reached 2,627 (walking-thoughts `bae1959`,
  `b07de18`). Centralize the taxonomy (missing media: permanent;
  model-cannot-read: permanent for the job, item recoverable under a new
  model; attempt cap of 25 as the backstop for failures no pattern
  anticipates) and make the requeue path honor it.
- **Never auto-retry failures on the heartbeat; retry is a user gesture.**
  Every automatic cycle resurrected every failed job ahead of new work — a
  fresh capture queued behind a herd of retried failures
  (walking-thoughts `015c4e2`).
- **Bound each server processing call by count and wall clock, and lease
  claims.** One call that ran the whole backlog serially outlived every
  caller's patience and was re-asked from the top; concurrent calls re-ran
  jobs already running. The fix: at most 3 jobs inside a 45 s budget,
  fresh work first, and a claim timestamp honored until it goes stale
  (5 min lease) (walking-thoughts `015c4e2`).
- **Recovery that does not retain what it learns is a self-inflicted
  DDoS.** Production hit ~19,000 requests per 40 minutes from two devices —
  every thread's results refetched every 6 seconds, a photo upload starved
  for 45 minutes behind the churn. Consult the retained local copy first,
  ask only about what it cannot account for, and keep what you fetch
  (walking-thoughts `c171535`).
- **The error string is the recovery key.** A catch that discarded the
  gateway error and recorded only `transcription_unavailable_<attachment>`
  left production logs showing a thread polling for a report that would
  never arrive, and nothing about why. Name the failing model or component
  in the recorded failure so config changes can be matched against it
  (walking-thoughts `62f7fab`).

## Weak-signal networking

`navigator.onLine` only catches airplane mode; one bar of real signal
passes every check and then every fetch hangs. Every request needs a
deadline sized to its shape (20 s JSON, 75 s model, 120 s media, 10 s
weather), stalls abort into the same local-first fallbacks as being offline,
and first paint never waits on the network — render from the local store,
refresh in the background behind a load-generation guard, and gate empty
states behind the first completed *local* load (walking-thoughts `2fe9a75`,
`6d88c57`). Navigation-level fallbacks and the service-worker half live in
GDE-014.

One warning that belongs here: **the service worker is part of the data
layer.** A stale cached shell ran a previous build's JavaScript offline and
silently applied a retired data model to new records
(walking-thoughts `3aae84c`). Cache versioning is a data-integrity concern.

## Multi-device convergence

No CRDTs, no vector clocks — an ownership rule made them unnecessary:

- **The device owns unsynced content.** Local records with outbound work are
  authoritative and never overwritten from the server; record content is
  never rewritten from remote.
- **The server owns settled placement.** Once a record has synced, hydration
  adopts the server's thread placement and ordering — stale-build local
  groupings could never converge until it did
  (walking-thoughts `1b3218c`).
- **Imports land as `complete`** so they never re-enter the outbound outbox.
- **Enumerate which fields ride the revision counter and which do not.**
  Title merges are revision-gated, but review state, classification, routes,
  and to-do state are adopted unconditionally because nothing bumps the
  revision for them — the split is deliberate and documented in
  `lib/sync/hydrate.ts`.
- **Server-derived per-item data flows back down.** A transcript written
  after the record synced must be adopted onto devices that already hold the
  record, or a spoken walk stays wordless on the phone that recorded it
  (walking-thoughts `a52cf45`).
- Ordering is a per-thread integer sequence assigned at commit plus ISO-8601
  timestamps, grouped by UTC civil day — and UTC day boundaries bite: pin
  clocks in tests (a 30-day-deadline test started failing by the calendar)
  and mind evening captures landing on tomorrow's date
  (walking-thoughts `8452252`).

## Media offline

- **Keep local originals by default; delete only after verifying the server
  copy with a real read** — status complete, a remote key, *and* a live
  round-trip against the authenticated media route before local bytes go
  (walking-thoughts `4970f95`).
- **Retain a thumbnail** written at commit so threads stay meaningful after
  originals are removed; degrade preview → remote copy → filename, with
  availability an explicit tri-state (on device / online only /
  unavailable).
- **Health checks exercise the real seam, not the presence of a
  credential.** A probe that asserted private access whenever a token
  existed hid a token pointing at the wrong store while every upload 500ed;
  it now puts, reads, and deletes a probe object
  (walking-thoughts `9653328`). Separate tokens per store so a publish task
  cannot target the private media store.

## Capability honesty

- **Verify model capabilities from live metadata; never assume.** Every
  audio capture failed because the default model reads text and images
  only — and the gateway's own table had two entries falsely claiming
  audio. Zero of 204 models accepted audio, so transcription-first was not
  the convenient route but the only one (ADR 0015).
- **Newest is not callable.** The newest transcription model was
  websocket-realtime and failed every stored file in production; the batch
  pipeline needed a batch-capable model at a tenth the price. Read the
  serving-mode tags (walking-thoughts `62f7fab`).
- **Never let a fake reach production.** Without a search key the pipeline
  fell back to a fake search client injecting `example.test` URLs as
  citable sources. Under production signals, skip the capability entirely
  instead of faking it, and report it in `/api/health`
  (walking-thoughts `a4685a1`).
- **Put derived text where every reader already looks.** Transcripts lived
  on the processing row while every surface read the record — a spoken walk
  was blank everywhere. One writer, one reader, and a backfill that copies
  from past results rather than re-running the expensive step
  (walking-thoughts `a52cf45`).
- **AI SDK footgun:** `result.text` is the last step's text alone; a report
  written before a tool call was replaced by the sentence after it, and
  five production threads survive only as a reference to a report that is
  not there. Collect every step's text (walking-thoughts `b07de18`).
- **Measure the contract against the corpus.** Of eleven fields every
  report was asked for, four came back empty or useless across 171 reports
  and were cut end-to-end — empty columns read as a system that is
  organizing when it is not (ADR 0019).

## Sync schema and migrations

- Tables are created by an idempotent in-code `ensure()`
  (`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS`)
  on first repository use.
- **Lazy migrations create invisible ordering dependencies for standalone
  scripts.** A backfill refused to run on a correctly deployed build because
  the column it needed is created lazily on first repository use; the script
  now runs the same idempotent ALTER itself (walking-thoughts `55beb2a`).
  Any out-of-band script runs or verifies the migrations it depends on.
- **Scripts must target the tables the app actually creates — guard it
  mechanically.** Two scripts and one route queried tables that never
  existed in production (`threads` instead of `sync_threads`); one failed
  loudly, one was silently inert behind a catch, one 500ed. A static test
  now reads every `` sql`…` `` in the repo and fails when a query names a
  table nothing creates — it costs no database, which is exactly why the
  bug was invisible (walking-thoughts `e39854a`, `064de4a`).
- **Optional infrastructure fails open.** pgvector may be unavailable on an
  older branch or an under-privileged role; that costs one fallback feature
  and nothing else, so its `CREATE EXTENSION` cannot take the schema down
  with it.
- **Backfills classify from the source, not the artifact,** write to every
  place the value is denormalized, and commit their findings as a dated
  record (walking-thoughts `367d5ce`).

## Deletion

Deletion is a synced, idempotent, deadline-bearing state machine of its
own: soft-delete into a syncable trash with a 30-day expiry; restore
rejected after expiry; pre-deadline purge a no-op; purge replay re-deletes
only the listed objects. Locally, trash records carry their own pending
action and idempotency key — a mini-outbox — and trash sync is wrapped so
its failure never blocks record sync (walking-thoughts `cd448a0`,
`3407a6d`). And external writes are never deleted: un-routing a thread that
drafted a GitHub issue orphans the record rather than deleting the issue
(ADR 0018).

## Pre-downloaded data (Offline Regions)

For map data — or any large corpus a user takes offline deliberately:

- **A region is a built artifact, not a tile cache.** Check licenses before
  building the pipeline: OSM tile preseeding is prohibited by policy,
  MapTiler and Mapbox terms restrict offline packaging; Protomaps daily
  builds (published for regional `pmtiles extract`) plus public-domain USGS
  3DEP are the clean path (ADR 0007).
- **Verify every byte before "installed"; write the marker last.** The
  manifest records per-file sizes and SHA-256 plus the total size shown
  before download; `installed.json` is written only after full verification
  so an interrupted download can never masquerade as installed
  (walking-thoughts `452c2c8`).
- **Stage, then activate — and copy before swapping** so a failed update
  cannot clear a previously verified pack. Every error message ends with
  the reassurance that the previous verified pack is still available
  (walking-thoughts `1db6fa4`).
- Engineering numbers worth reusing: a 40 km-radius topo pack is 87 MB
  (basemap 42.9, terrain 21.8, contours 21.7, fonts 1.2); first-party
  terrain tiles with 1 m vertical quantization cut the artifact 82 → 22 MB;
  terrain scales ~4× per zoom level; single-file PMTiles range-read from
  OPFS need no serving layer. Full pipeline:
  walking-thoughts `docs/offline-region/pipeline.md`.
- **`NEXT_PUBLIC_*` values must be read as literal static expressions** or
  they are never inlined into the client bundle — production quietly
  shipped the fixture region until the env var was read directly at the
  use site (walking-thoughts `85d756f`).

## Diagnosability

- **Build a read-first doctor for indistinguishable failure states.** "No
  result yet" covered three different breaks — never queued, failed, stuck
  mid-claim — indistinguishable from outside. A script reads the records,
  jobs, and results together and says which; `--fix` releases stuck claims;
  destructive re-runs never delete a result the user may have acted on
  (walking-thoughts `86f7839`).
- **Log outcomes on seams that swallow failures on purpose.** A publish
  seam that deliberately never fails the job behind it left production
  silent — a salvaged page and a laid-out page looked identical from
  outside. One prefixed JSON log line per seam, carrying the outcome and
  passing the error through (walking-thoughts `4579818`).
- Per-environment resource isolation and an honest `/api/health` (ready /
  missing / error per service, booleans not secret values) are part of the
  offline-first contract (ADR 0009; STD-007, STD-008 govern the secrets and
  deployment halves).

## Anti-patterns

- Remote-first writes; a spinner between the user and a local commit.
- Invisible processing states; one status counter spanning pipelines.
- Auto-retrying failures on the heartbeat; retries without a permanent
  failure taxonomy or an attempt cap.
- Unbounded "process everything" server calls; no claim leases.
- Recovery sweeps and polls that re-ask about settled state forever.
- In-memory server fallbacks reachable under production signals; fake
  clients that can feed a real pipeline.
- 401 treated as a network failure; a token's existence treated as a
  working service.
- Metadata pushed before its media; imports that re-enter the outbox.
- Deleting local originals without verifying the server copy by reading it.
- Lazy in-app migrations relied on by standalone scripts.
- Dropping columns to retire features.
- Tile caching passed off as offline data; activation that can destroy the
  previously verified pack.

## New project checklist

- [ ] Local store committed before any network; draft survives quota
      failure; persistence requested and reported
- [ ] Five-state lifecycle on every item, with reason + retryability
- [ ] One serialized sync cycle: hydrate → recover → outbox
      (media → metadata → processing)
- [ ] Idempotency keys on every mutation, unique-enforced server-side;
      key scopes let config changes unlock exactly one retry
- [ ] Permanent-failure taxonomy + attempt cap; retry is a user gesture
- [ ] Server processing bounded by count and time, with claim leases
- [ ] Ownership rules written down: device owns unsynced, server owns
      settled; revision-gated vs unconditional fields enumerated
- [ ] Deadlines on every fetch; first paint from local state
- [ ] Session-refused tracked apart from offline
- [ ] Static guard: every SQL query names a table something creates
- [ ] Health endpoint probes real round-trips, not credential presence
- [ ] Trash/restore/purge as synced idempotent operations
- [ ] Pre-downloaded packs: verified manifest, staged crash-safe
      activation, marker written last
