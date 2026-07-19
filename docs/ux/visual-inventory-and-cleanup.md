# Visual inventory → use cases → cleanup

Snapshot of the shipped UI (Pixel-sized mobile + desktop), mapped to the
canonical Walking Thoughts use cases, with a cleanup proposal aimed at three
pain points:

1. The home surface spends too much vertical space before useful work.
2. Sync / Enrichment progress is hard to see at a glance.
3. The map is easy to miss — it is not on home, and home’s “Offline Region”
   block is not a map.

Screenshots from this pass live under the agent artifacts for the run
(`visual-inventory/`).

## Major use cases

| Use case | Domain terms | What success looks like |
| --- | --- | --- |
| **A. Capture on the trail** | Capture, Thread | One-handed append (text / photo / audio / video) that commits locally even offline |
| **B. Trust local → cloud processing** | Capture status, Enrichment | See Saved locally → Syncing → Enriching → Complete / Needs attention without digging |
| **C. Review by day** | Thread, Inbox | Browse hike Threads chronologically; continue one on the trail |
| **D. Review by place** | Map Journal, Offline Region | See Capture markers on the Offline Region map; open Thread context |
| **E. Prepare for airplane mode** | Offline Region | Download / verify a trail-first pack before leaving connectivity |
| **F. Account honesty** | Export, disclosure | Export history; understand what leaves the device (no E2E claim) |

ADR alignment: local-first visible processing (`docs/adr/0003`), Offline Region
pipeline (`docs/adr/0007`), Map Journal as place-first review
(`docs/map-journal/README.md`).

## Surface inventory

```text
/  AppShell (trail home)
├── Topbar: brand · Threads · Map Journal · "Ready offline" · account
├── Hero: eyebrow + huge H1 + lede
├── CTA: "Browse Threads by day →"   ← points at C, not D
├── CaptureComposer (auth only)
│   ├── Foreground sync bar + Retry
│   ├── Push opt-in / persistence notes
│   ├── Today's Thread timeline (status chips per Capture)
│   ├── OutdoorCaptureDock + composer card
│   ├── Inbox (if any)
│   └── Continue another Thread
├── OfflineRegionPanel               ← text download UI, NOT a map; unstyled
├── AccountExport
├── DataHandlingDisclosure
└── Footer

/journal  Map Journal                ← THE product map
├── Compact topbar + GPS + connectivity
├── Offline Region MapLibre surface + Capture markers
├── Thread / Capture panel (desktop side / mobile sheet)
└── DataHandlingDisclosure below the map

/threads  Threads by day             ← use case C
/region-tracer                       ← pipeline proof; not in product nav
/offline                             ← same AppShell (PWA fallback)
```

### What each screen currently serves

| Screen | Primary job today | Actually good at | Weak for |
| --- | --- | --- | --- |
| `/` | Capture + everything else | Trail capture when signed in | Density; map findability; sync at-a-glance |
| `/journal` | Place review | Real topographic Offline Region + markers | Discoverability from home; disclosure steals map height |
| `/threads` | Day archive | Chronological Thread browse | Empty-state dead space; no sync summary |
| `/region-tracer` | Pipeline validation | Proves airplane-mode pack | Looks like “the map” if someone finds it; not linked from home |

### First-viewport findings (mobile)

On a Pixel-ish viewport, home first paint is roughly:

1. Topbar links (Threads, Map Journal, Ready offline)
2. Marketing-scale “Walking Thoughts” hero (`clamp(3rem, 9vw, 6.8rem)` + `4rem` padding)
3. Threads CTA
4. Then either CaptureComposer **or** the Offline Region download form

The Offline Region block on home:

- Explains packs and offers radius + Download
- Status: “No Offline Region downloaded yet”
- Promise: “Download a region to render maps in airplane mode”
- **Never renders MapLibre** — only a text placeholder when active
- Has **no CSS** for `.offline-region-*` in `app/globals.css` (unstyled dump below the hero)

The real map only appears after navigating to **Map Journal** (topbar) or the
unlinked `/region-tracer`. Docs still say home should pitch
“Review your walks on the Map Journal”; the live CTA instead sends people to
`/threads`.

### Sync visibility findings

Status **does** exist at the Capture level (`Saved locally` / `Syncing` /
`Enriching` / `Complete` / `Needs attention`) — matching ADR 0003 — but it is
easy to miss because:

| Signal | Where | Problem |
| --- | --- | --- |
| “Ready offline” | Topbar | Means **shell cache** ready, not Capture sync |
| Foreground sync copy | Above timeline | Long muted policy sentence, not counts |
| Per-Capture status | Inside each entry | Only visible after Captures exist; no rollup |
| “How synchronized data is handled” | Bottom card on `/` and `/journal` | Explains **policy**, not **current state** |
| Enriching placeholder | Timeline | Good when present; absent when idle |

So the user can be online, have pending work, and still see a calm green
“Ready offline” with no queue summary.

## Cleanup proposal

Goal: one job per surface, map findable in one tap, sync state glanceable,
trail Capture not buried under marketing + settings.

### P0 — Make the map findable

1. **Replace the home Threads CTA** with a primary “Open Map Journal” action
   (restore the intent in `docs/map-journal/README.md`). Keep Threads in the
   topbar.
2. **Remove `OfflineRegionPanel` from home** (or collapse to a one-line status
   linking to `/journal`). Download / resume already lives on Map Journal’s
   empty state — one Offline Region story, not two.
3. **Keep `/region-tracer` out of product nav** (dev/proof only).

### P1 — Reclaim vertical space on the trail

1. **Trail mode on `/`**: compact header + today’s Thread + Capture dock.
   Drop the marketing H1 size on the authenticated home (brand can stay in
   the topbar mark).
2. **Sticky Capture dock** at the bottom on mobile; timeline scrolls above it.
3. **Move Account export + data-handling disclosure** into an Account /
   Settings sheet (still reachable, not on every first viewport). Keep a short
   offline promise near Capture if needed for trust.
4. On `/journal`, **move the disclosure out of the map column** so the map is
   full-bleed under the status bar.

### P2 — Make sync glanceable

1. **Replace the foreground sync sentence** with a compact chip, e.g.
   `2 local · 1 syncing · 1 enriching` + Retry, updating from the Capture
   store.
2. **Rename or relocate “Ready offline”** so it cannot be read as sync health
   (e.g. “Shell cached” in settings, or only show while preparing).
3. **Surface `needs_attention` in the topbar** when any Capture/attachment is
   stuck — do not rely on scrolling the timeline.
4. Keep per-entry status chips; they remain the source of truth for each
   Capture.

### Suggested IA after cleanup

```text
/            Trail Capture
             [sync chip]  today's Thread  [sticky Capture dock]
             link: Map Journal · Threads · Account

/journal     Map + Offline Region install + place review
/threads     Day archive
Account      Export · data handling · shell offline readiness
```

### Non-goals for this cleanup

- Redesigning Enrichment quality or model routing
- Changing Offline Region packaging / PMTiles pipeline
- Promoting `/region-tracer` into the product shell

## Implementation seams (when scheduled)

| Change | Likely touch points |
| --- | --- |
| Home CTA + demote OfflineRegionPanel | `components/app-shell.tsx` |
| Compact trail layout / sticky dock | `app/globals.css`, `components/capture-composer.tsx` |
| Sync rollup chip | `components/capture-composer.tsx`, Capture store list helpers |
| Journal chrome | `components/map-journal.tsx`, journal CSS |
| Tests | outdoor-capture, disclosures, map-journal, offline-region specs |

Recommend filing a product ticket from this note before implementation, then
claiming it with `mise run issue:claim` per `docs/agents/issue-workflow.md`.
