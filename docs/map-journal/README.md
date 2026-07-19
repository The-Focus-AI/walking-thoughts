# Map Journal (#14)

The Map Journal at `/journal` makes the Offline Region the primary review
surface, following the reviewing-ui prototype verdict (variant C, "a journal
organized by place" on the `prototype-reviewing-ui` branch). The throwaway
prototype was rewritten, not promoted.

## How it works

- The installed Offline Region (see `docs/offline-region/`) fills the surface
  through `renderInstalledRegion`; if the region is not installed the page
  offers the explicit download with its size, and renders nothing implicit.
- Capture locations become media-aware markers (`lib/map-journal/markers.ts`):
  text, photo, audio, and video Captures get distinct colors and glyphs, and
  Captures without a recorded location honestly stay off the map.
- Markers cluster while zoomed out (`lib/map-journal/map-layers.ts`, MapLibre
  GeoJSON clustering with circle + text layers only — no sprite assets, so the
  markers work in airplane mode with the packaged region fonts).
- Selecting a marker opens a compact Capture preview (with inline local media)
  plus the complete Thread as one chronological append-only stream — Captures
  interleaved with the Enrichments whose basis revision follows them, each
  with sources and exact models — and a follow-up composer. Desktop shows the
  Thread panel adjacent to the map; mobile uses a bottom sheet over it.
- Enrichments load from the server when online and are retained locally
  (`lib/enrichment/thread-view.ts`) so previously reviewed Threads keep their
  Enrichments readable in airplane mode.
- Follow-ups use the ordinary Capture pipeline with optional media
  attachments: local commit first through the Capture store, then foreground
  synchronization and Enrichment when online.
- The home shell links to the journal as the primary review destination
  ("Review your walks on the Map Journal").
- Live browser GPS runs only while the map surface is mounted
  (`watchPosition` cleared on unmount) and reports honest states: starting,
  unavailable, or tracking with the reported accuracy.
- The header states what connectivity changes: offline, Captures still save
  on this device and Enrichment resumes online.

## Tests

`tests/map-journal.spec.ts` (Pixel-9 project) covers offline topography,
clustering and media-aware markers, honest GPS states, marker preview with
complete Thread context and the mobile bottom sheet, an offline follow-up
through the ordinary pipeline, and complete airplane-mode rendering.
`tests/map-journal-desktop.spec.ts` runs on a dedicated Desktop Chrome
Playwright project and asserts the adjacent Thread panel layout.
