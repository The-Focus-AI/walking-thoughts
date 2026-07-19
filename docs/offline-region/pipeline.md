# Offline Region pipeline (#12 tracer)

This documents the validated pipeline that turns legally packageable US data
into a sharp, airplane-mode, trail-first topographic Offline Region, plus the
measurements from the real 40-kilometer home region around Cornwall,
Connecticut. Decision record: `docs/adr/0007-offline-region-pipeline.md`.

## Selected pipeline

One region build (`scripts/offline-region/build-region.sh`) produces:

| Artifact | Source | Tooling | License |
| --- | --- | --- | --- |
| `basemap.pmtiles` (z0–15 vector) | Protomaps daily planet build (OpenStreetMap, Natural Earth) | `pmtiles extract --bbox` | ODbL 1.0 / CC0 |
| `terrain.pmtiles` (z6–13 terrarium raster-dem) | USGS 3DEP 1/3 arc-second GeoTIFFs | `scripts/offline-region/build-terrain.py` (GDAL warp → terrarium PNG → MBTiles) + `pmtiles convert` | Public domain |
| `contours.pmtiles` (z11–14 vector, 10 m + 50 m index) | USGS 3DEP 1/3 arc-second GeoTIFFs | `gdalbuildvrt` + `gdalwarp` + `gdal_contour` + `tippecanoe` | Public domain |
| `fonts/` (Latin glyph ranges ×3 stacks) | protomaps/basemaps-assets | `curl` | OFL |
| `manifest.json` | — | `scripts/offline-region/make-manifest.py` | — |

The manifest records bounds, per-file byte sizes and SHA-256 hashes, total
pack size (shown to the user before download), and the source/attribution
list. The client (`lib/offline-region/store.ts`) verifies every byte count and
hash before anything is treated as installed, writes artifacts into
origin-private file storage, and writes the `installed.json` marker last so an
interrupted download can never masquerade as an installed region.

Rendering (`lib/offline-region/map.ts` + `lib/offline-region/style.ts`) uses
MapLibre GL JS with the PMTiles protocol reading directly from OPFS `File`
handles and a `region-glyphs://` protocol for offline text glyphs. The style
starts from the Protomaps light flavor and makes it trail-first:

- Walkable paths draw as bold dashed warm-brown lines with a cream casing,
  above every road layer, visible from z10, with trail-name labels.
- Driving detail is muted (desaturated highway/major/minor colors, no shields,
  no oneway arrows).
- USGS hillshade and 10 m contours with 50 m labeled index contours sit under
  the line work; elevation labels render along index contours.
- The basemap's z15 max zoom overzooms sharply as vectors through z17+.

Attribution (`© OpenStreetMap contributors, © Protomaps, USGS 3DEP`) renders
in the map's attribution control, satisfying ODbL and Protomaps terms; 3DEP is
public domain but credited anyway.

## Legal basis

- Protomaps daily builds are published for download and regional extraction
  (`pmtiles extract` fetches only the region's tile ranges). OpenStreetMap
  data under ODbL requires attribution, which the manifest and map control
  carry. No requests ever touch the public `tile.openstreetmap.org` service.
- USGS 3DEP staged GeoTIFF products are US public domain and explicitly
  distributed for bulk download from `prd-tnm.s3.amazonaws.com`.
- Noto fonts (glyph PBFs from protomaps/basemaps-assets) are OFL.

## Rejected alternatives

- **Preseeding OSM raster tile servers** — explicitly prohibited by the OSM
  tile usage policy; raster topo (OpenTopoMap, scanned USGS quads) is also
  blurry when overzoomed and far larger per region.
- **OpenMapTiles / MapTiler downloads** — free-tier terms restrict offline
  redistribution and self-hosted packaging; nothing they add is needed.
- **Mapbox vector tiles** — ToS forbids offline persistence beyond their SDK
  caches.
- **AWS Open Data terrarium terrain tiles** — workable, but a mix of DEM
  sources (SRTM, GMTED, NED…) with messier attribution, and the tiles carry
  sub-meter noise in the blue channel that compresses badly. Building
  terrarium tiles first-party from 3DEP with 1 m vertical quantization cut the
  terrain artifact from 82 MB to 22 MB with no visible hillshade difference.
- **MBTiles + tile server** — needs a serving layer; PMTiles is one file per
  artifact, range-readable straight out of OPFS.

## Home-region measurements (Cornwall CT, 40 km radius)

Sources: 4 × 3DEP 1° GeoTIFFs = 1.82 GB downloaded once and reusable; the
Protomaps extract transferred 45 MB for the region. Build time is ~3 minutes
on 4 cores, dominated by contour generation.

Measured through the public `/region-tracer` seam on a Pixel-9-sized
(412×915) Chromium viewport with `scripts/offline-region/measure-region.mjs`:

| Measurement | Value |
| --- | --- |
| Pack size (downloaded = installed) | 87.0 MB (basemap 42.9, terrain 21.8, contours 21.7, fonts 1.2) |
| Download + verify + install to OPFS (localhost) | 0.9 s |
| First render (map create → idle) | 1.4 s |
| Re-render per zoom step z11–z17 | 0.6–2.0 s |
| Pan 300 px at z14 | 0.7 s |
| Airplane-mode reload → fully rendered | 1.2 s |
| Storage usage / quota after install | 88.9 MB of 3.3 GB (headless quota); `navigator.storage.persist()` requested |

Airplane-mode rendering, sharpness through z14–z17, trail-first layer
ordering, contour/elevation labels, and corrupted-artifact rejection are
locked in by `tests/offline-region-tracer.spec.ts` against the committed
1.5 km fixture region (`public/offline-region/fixture/`, 2.4 MB), which is
built by the same script and pipeline.

## Pixel 9 validation record

The Playwright `pixel-9` project (412×915 viewport, mobile Chrome UA) is the
repository's Pixel 9 seam. Validation observed there and in the captured
screenshots:

- **Trail legibility** — dashed warm-brown trails with cream casing read
  clearly against hillshade at z11+; trail names appear from z13.
- **Contour and hillshade quality** — 10 m contours with 50 m labeled index
  contours; 1 m-quantized 3DEP hillshade shows ridge/valley structure without
  banding.
- **Pan and zoom behavior** — idle-to-idle re-render stayed under 2 s per
  zoom step and 0.7 s for a 300 px pan at z14 in software-rendered headless
  Chromium (a Pixel 9 GPU is faster).
- **Complete airplane-mode rendering** — with the network context offline,
  reload reaches a fully painted map in 1.2 s; tiles, glyphs, and style all
  come from origin-private file storage.

On-device spot check (requires deployed Preview): install the PWA on the
Pixel 9, open `/region-tracer`, download the region, enable airplane mode,
relaunch, and confirm the map renders and pans across the region. The
committed fixture region works on any deployment; the full home artifact set
(87 MB) is gitignored and can be published when production ingestion lands
(#13).

## Production notes

- The pipeline is parameterized by center/radius and writes any number of
  regions; #13's download/resume/update flow can serve the same manifest and
  artifacts from private storage instead of `public/`.
- Terrain artifact size scales ~4× per extra zoom level; z13 raster-dem with
  vector overzoom was judged the right sharpness/size trade at 40 km radius.
- `pmtiles extract` against a pinned daily build gives reproducible basemap
  input; record the build date (in the manifest `sources`) for updates.
