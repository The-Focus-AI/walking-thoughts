# Offline Region tracer (#12)

Technical tracer proving that legally packageable US data produces a sharp,
useful, airplane-mode trail-first topographic map on Pixel 9, for one real
25-mile / 40-kilometer home Offline Region.

- `pipeline.md` — selected pipeline, legal basis, rejected alternatives,
  home-region measurements, and the Pixel 9 validation record.
- `docs/adr/0007-offline-region-pipeline.md` — the decision record.
- `scripts/offline-region/` — the build and measurement tooling.
- `/region-tracer` — the browser seam that downloads, verifies, stores, and
  renders a region (`?region=fixture` for the committed test region).

Build a region:

```bash
# One-time DEM download (public domain USGS 3DEP, reusable across builds)
mkdir -p /tmp/region/3dep && cd /tmp/region/3dep
for t in n42w074 n42w073 n43w074 n43w073; do
  curl -sL -O "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/$t/USGS_13_$t.tif"
done

scripts/offline-region/build-region.sh \
  --region home \
  --name "Cornwall, Connecticut" \
  --center 41.844,-73.329 \
  --radius-km 40 \
  --dem-dir /tmp/region/3dep \
  --basemap-build 20260718 \
  --out public/offline-region/home
```

Measure it on a Pixel-9-sized viewport (server must be running):

```bash
pnpm build && pnpm start --hostname 127.0.0.1 --port 3103 &
node scripts/offline-region/measure-region.mjs --region home
```
