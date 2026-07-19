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
- Selecting a marker opens a compact Capture preview plus the complete Thread
  (Captures, Enrichments with sources and exact models, processing status)
  and a follow-up composer. Desktop shows the Thread panel adjacent to the
  map; mobile uses a bottom sheet over it.
- Follow-ups use the ordinary Capture pipeline: local commit first through the
  Capture store, then foreground synchronization and Enrichment when online.
- Live browser GPS runs only while the map surface is mounted
  (`watchPosition` cleared on unmount) and reports honest states: starting,
  unavailable, or tracking with the reported accuracy.
- The header states what connectivity changes: offline, Captures still save
  on this device and Enrichment resumes online.

## Tests

`tests/map-journal.spec.ts` covers offline topography, clustering and
media-aware markers, honest GPS states, marker preview and complete Thread
context, an offline follow-up through the ordinary pipeline, complete
airplane-mode rendering, and the desktop adjacent-panel layout, on the
Pixel-9-sized project plus a desktop viewport.
