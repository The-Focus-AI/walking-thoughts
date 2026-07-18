# Offline Region

Trail-first Offline Regions are **explicit downloads** with a versioned
manifest, integrity checks, and atomic activation. Previously viewed network
tiles are never treated as an Offline Region.

## Runtime seams (`lib/offline-region/`)

- `sizing.ts` — default ~40 km / 25 mi home radius and pack size estimate
- `catalog.ts` — pack plan + asset fetch (deterministic demo catalog for now)
- `pack-store.ts` — origin-private active/staging slots (memory + IndexedDB)
- `manager.ts` — download, resume, verify, activate, airplane-mode render

## Update safety

Downloads write into a **staging** slot. The active pack is replaced only after
every asset passes checksum verification (`activateStaging`). Failed updates,
quota errors, and integrity failures leave the previous verified pack intact.

## Tracer note (#12)

Production ingestion should package legally redistributable US trail-first
sources (trails, contours, hillshade, water, roads, land cover, places,
elevation labels) into compact vector artifacts. Do not bulk-download or preseed
the public OpenStreetMap tile service.
