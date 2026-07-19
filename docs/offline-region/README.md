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

## Pipeline tracer (#12)

The tracer proves that legally packageable US data produces a sharp,
airplane-mode trail-first topographic map on Pixel 9, for one real
25-mile / 40-kilometer home Offline Region:

- `pipeline.md` — selected pipeline, legal basis, rejected alternatives,
  home-region measurements, and the Pixel 9 validation record.
- `docs/adr/0007-offline-region-pipeline.md` — the decision record.
- `scripts/offline-region/` — the build and measurement tooling
  (`lib/offline-region/store.ts`, `style.ts`, `map.ts` are its runtime seams).
- `/region-tracer` — the browser seam that downloads, verifies, stores, and
  renders a packaged region (`?region=fixture` for the committed test region).

Build and publish the home region (Cornwall Bridge, ~40 km):

```bash
# One-time DEM download (public domain USGS 3DEP, reusable across builds)
mkdir -p /tmp/region/3dep && cd /tmp/region/3dep
for t in n42w074 n42w073 n43w074 n43w073; do
  curl -sL -O "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/$t/USGS_13_$t.tif"
done

mise run region:build -- \
  --region home \
  --name "Cornwall Bridge, Connecticut" \
  --center 41.819,-73.371 \
  --radius-km 40 \
  --dem-dir /tmp/region/3dep \
  --basemap-build 20260718 \
  --out public/offline-region/home

# Upload to the public Vercel Blob store (BLOB_REGION_READ_WRITE_TOKEN).
# Prints the base URL for NEXT_PUBLIC_OFFLINE_REGION_HOME_BASE.
mise run region:publish -- \
  --dir public/offline-region/home \
  --prefix offline-region/home
```

`public/offline-region/home` stays gitignored. Production and Preview load the
pack from Blob via `NEXT_PUBLIC_OFFLINE_REGION_HOME_BASE`. Keep
`BLOB_REGION_READ_WRITE_TOKEN` on the public regions store separate from
`BLOB_READ_WRITE_TOKEN` (private Capture media).

`pmtiles` comes from mise (`ubi:protomaps/go-pmtiles`); tippecanoe and GDAL
have no mise backend — install GDAL with
`apt install gdal-bin python3-gdal python3-numpy` and build
[felt/tippecanoe](https://github.com/felt/tippecanoe) with `make && make install`.

Measure it on a Pixel-9-sized viewport (server must be running; Blob base set):

```bash
pnpm build && pnpm start --hostname 127.0.0.1 --port 3103 &
mise run region:measure -- --region home
```

Production ingestion (#13's download/resume/update flow) should package these
same legally redistributable US trail-first sources into compact vector
artifacts. Do not bulk-download or preseed the public OpenStreetMap tile
service.
