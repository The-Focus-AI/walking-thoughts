#!/usr/bin/env python3
"""Write the versioned Offline Region manifest with artifact sizes and hashes."""

import argparse
import datetime
import hashlib
import json
import os

parser = argparse.ArgumentParser()
parser.add_argument("--region", required=True)
parser.add_argument("--name", required=True)
parser.add_argument("--center", required=True, help="lat,lon")
parser.add_argument("--radius-km", type=float, required=True)
parser.add_argument("--bbox", required=True, help="west,south,east,north")
parser.add_argument("--basemap-build", required=True)
parser.add_argument("--dir", required=True)
args = parser.parse_args()


def describe(path: str) -> dict:
    digest = hashlib.sha256()
    with open(os.path.join(args.dir, path), "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return {
        "path": path,
        "bytes": os.path.getsize(os.path.join(args.dir, path)),
        "sha256": digest.hexdigest(),
    }


fonts = []
fonts_dir = os.path.join(args.dir, "fonts")
for stack in sorted(os.listdir(fonts_dir)):
    for range_file in sorted(os.listdir(os.path.join(fonts_dir, stack))):
        fonts.append(describe(os.path.join("fonts", stack, range_file)))

lat, lon = (float(part) for part in args.center.split(","))
artifacts = [describe(name) for name in ("basemap.pmtiles", "terrain.pmtiles", "contours.pmtiles")]

manifest = {
    "version": 1,
    "region": args.region,
    "name": args.name,
    "center": {"latitude": lat, "longitude": lon},
    "radiusKm": args.radius_km,
    "bounds": [float(part) for part in args.bbox.split(",")],
    "generatedAt": datetime.datetime.now(datetime.timezone.utc)
    .isoformat(timespec="seconds")
    .replace("+00:00", "Z"),
    "artifacts": artifacts,
    "fonts": fonts,
    "totalBytes": sum(item["bytes"] for item in artifacts + fonts),
    "sources": [
        {
            "id": "protomaps-basemap",
            "description": f"Protomaps daily planet build {args.basemap_build} (OpenStreetMap, Natural Earth)",
            "license": "ODbL 1.0 (OpenStreetMap); CC0 (Natural Earth)",
            "attribution": "© OpenStreetMap contributors, © Protomaps",
        },
        {
            "id": "usgs-3dep",
            "description": "USGS 3D Elevation Program 1/3 arc-second DEM (terrain + contours)",
            "license": "Public domain (U.S. Geological Survey)",
            "attribution": "USGS 3DEP",
        },
    ],
    "attribution": "© OpenStreetMap contributors, © Protomaps, USGS 3DEP",
}

with open(os.path.join(args.dir, "manifest.json"), "w") as handle:
    json.dump(manifest, handle, indent=2)
    handle.write("\n")

print(f"manifest.json: {manifest['totalBytes']} total bytes")
