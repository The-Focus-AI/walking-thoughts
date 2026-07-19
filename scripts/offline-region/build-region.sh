#!/usr/bin/env bash
# Build one Offline Region artifact set: basemap, terrain, contours, fonts,
# and a verified manifest. See docs/offline-region/pipeline.md.
#
# Required tools: pmtiles (go-pmtiles), tippecanoe, GDAL (gdal_contour,
# gdalbuildvrt, gdalwarp, python3-gdal, numpy), curl, python3.
#
# Usage:
#   scripts/offline-region/build-region.sh \
#     --region home \
#     --name "Cornwall, Connecticut" \
#     --center 41.844,-73.329 \
#     --radius-km 40 \
#     --dem-dir /tmp/region/3dep \
#     --basemap-build 20260718 \
#     --out public/offline-region/home
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REGION=""
NAME=""
CENTER=""
RADIUS_KM=""
DEM_DIR=""
BASEMAP_BUILD=""
OUT=""
TERRAIN_MAX_ZOOM=13
CONTOUR_MIN_ZOOM=11
CONTOUR_MAX_ZOOM=14

while [ $# -gt 0 ]; do
  case "$1" in
    --region) REGION="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --center) CENTER="$2"; shift 2 ;;
    --radius-km) RADIUS_KM="$2"; shift 2 ;;
    --dem-dir) DEM_DIR="$2"; shift 2 ;;
    --basemap-build) BASEMAP_BUILD="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --terrain-max-zoom) TERRAIN_MAX_ZOOM="$2"; shift 2 ;;
    --contour-min-zoom) CONTOUR_MIN_ZOOM="$2"; shift 2 ;;
    --contour-max-zoom) CONTOUR_MAX_ZOOM="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

for required in REGION NAME CENTER RADIUS_KM DEM_DIR BASEMAP_BUILD OUT; do
  if [ -z "${!required}" ]; then
    echo "missing --$(echo "$required" | tr '[:upper:]_' '[:lower:]-')" >&2
    exit 1
  fi
done

for tool in pmtiles tippecanoe gdal_contour gdalwarp gdalbuildvrt curl python3; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }
done

BBOX="$(python3 "$SCRIPT_DIR/region-math.py" --center "$CENTER" --radius-km "$RADIUS_KM")"
echo "region $REGION bbox: $BBOX"

WORK="$(mktemp -d /tmp/offline-region-XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"

echo "== basemap: extracting Protomaps daily build $BASEMAP_BUILD"
pmtiles extract "https://build.protomaps.com/${BASEMAP_BUILD}.pmtiles" \
  "$OUT/basemap.pmtiles" --bbox="$BBOX"

echo "== terrain: terrarium raster-dem tiles from USGS 3DEP"
python3 "$SCRIPT_DIR/build-terrain.py" \
  --dem-dir "$DEM_DIR" \
  --bbox="$BBOX" \
  --min-zoom 6 \
  --max-zoom "$TERRAIN_MAX_ZOOM" \
  --out "$WORK/terrain.mbtiles"
rm -f "$OUT/terrain.pmtiles"
pmtiles convert "$WORK/terrain.mbtiles" "$OUT/terrain.pmtiles"

echo "== contours: gdal_contour from USGS 3DEP at ~20 m resolution"
gdalbuildvrt "$WORK/dem.vrt" "$DEM_DIR"/*.tif
gdalwarp -q -t_srs EPSG:4326 -te ${BBOX//,/ } -tr 0.00018 0.00018 \
  -r bilinear -ot Float32 "$WORK/dem.vrt" "$WORK/dem-crop.tif"
gdal_contour -q -b 1 -a ele -i 10 -f FlatGeobuf "$WORK/dem-crop.tif" "$WORK/contour_10.fgb"
gdal_contour -q -b 1 -a ele -i 50 -f FlatGeobuf "$WORK/dem-crop.tif" "$WORK/contour_50.fgb"
rm -f "$OUT/contours.pmtiles"
tippecanoe -q -o "$OUT/contours.pmtiles" \
  --minimum-zoom="$CONTOUR_MIN_ZOOM" --maximum-zoom="$CONTOUR_MAX_ZOOM" \
  --simplification=4 --simplify-only-low-zooms \
  --no-tile-size-limit \
  --name="Walking Thoughts contours" \
  --attribution="USGS 3DEP (U.S. Geological Survey, public domain)" \
  -L "contour_10:$WORK/contour_10.fgb" \
  -L "contour_50:$WORK/contour_50.fgb"

echo "== fonts: Latin glyph ranges from protomaps/basemaps-assets"
FONT_RANGES="0-255 256-511 512-767 768-1023"
for stack in "Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic"; do
  mkdir -p "$OUT/fonts/$stack"
  for range in $FONT_RANGES; do
    target="$OUT/fonts/$stack/$range.pbf"
    [ -s "$target" ] && continue
    encoded="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$stack")"
    curl -fsSL "https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts/$encoded/$range.pbf" \
      -o "$target"
  done
done

echo "== manifest"
python3 "$SCRIPT_DIR/make-manifest.py" \
  --region "$REGION" \
  --name "$NAME" \
  --center "$CENTER" \
  --radius-km "$RADIUS_KM" \
  --bbox="$BBOX" \
  --basemap-build "$BASEMAP_BUILD" \
  --dir "$OUT"

echo "== done"
du -sh "$OUT"
ls -la "$OUT"
