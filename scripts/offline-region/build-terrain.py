#!/usr/bin/env python3
"""Package terrarium-encoded raster-dem PNG tiles from USGS 3DEP GeoTIFFs.

Writes an MBTiles archive covering a bounding box across a zoom range. The
output feeds `pmtiles convert` to produce the Offline Region terrain artifact
used for hillshading in MapLibre (raster-dem, encoding "terrarium").
"""

import argparse
import glob
import math
import os
import sqlite3
import sys

import numpy as np
from osgeo import gdal

gdal.UseExceptions()

WEB_MERCATOR_MAX = 20037508.342789244
TILE_SIZE = 256


def lonlat_to_tile(lon: float, lat: float, zoom: int) -> tuple[int, int]:
    n = 2**zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def tile_range_bounds_3857(
    zoom: int, x0: int, y0: int, x1: int, y1: int
) -> tuple[float, float, float, float]:
    n = 2**zoom
    span = 2 * WEB_MERCATOR_MAX
    west = -WEB_MERCATOR_MAX + x0 / n * span
    east = -WEB_MERCATOR_MAX + (x1 + 1) / n * span
    north = WEB_MERCATOR_MAX - y0 / n * span
    south = WEB_MERCATOR_MAX - (y1 + 1) / n * span
    return west, south, east, north


def terrarium_encode(elevation: np.ndarray, precision_m: float) -> np.ndarray:
    quantized = elevation.astype(np.float64)
    if precision_m > 0:
        # Sub-meter noise compresses terribly and adds nothing to hillshading.
        quantized = np.round(quantized / precision_m) * precision_m
    v = np.clip(quantized + 32768.0, 0.0, 65535.996)
    whole = np.floor(v)
    r = np.floor(whole / 256.0)
    g = np.mod(whole, 256.0)
    b = np.floor((v - whole) * 256.0)
    return np.stack([r, g, b]).astype(np.uint8)


def encode_png(rgb: np.ndarray) -> bytes:
    mem = gdal.GetDriverByName("MEM").Create("", TILE_SIZE, TILE_SIZE, 3, gdal.GDT_Byte)
    for band in range(3):
        mem.GetRasterBand(band + 1).WriteArray(rgb[band])
    path = "/vsimem/tile.png"
    gdal.GetDriverByName("PNG").CreateCopy(path, mem)
    handle = gdal.VSIFOpenL(path, "rb")
    gdal.VSIFSeekL(handle, 0, os.SEEK_END)
    size = gdal.VSIFTellL(handle)
    gdal.VSIFSeekL(handle, 0, os.SEEK_SET)
    data = gdal.VSIFReadL(1, size, handle)
    gdal.VSIFCloseL(handle)
    gdal.Unlink(path)
    return data


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dem-dir", required=True, help="Directory of source GeoTIFFs")
    parser.add_argument("--bbox", required=True, help="west,south,east,north (WGS84)")
    parser.add_argument("--min-zoom", type=int, default=6)
    parser.add_argument("--max-zoom", type=int, default=13)
    parser.add_argument(
        "--precision-m",
        type=float,
        default=1.0,
        help="Vertical quantization in meters (0 keeps full precision)",
    )
    parser.add_argument("--name", default="Walking Thoughts terrain")
    parser.add_argument(
        "--attribution", default="USGS 3DEP (U.S. Geological Survey, public domain)"
    )
    parser.add_argument("--out", required=True, help="Output MBTiles path")
    args = parser.parse_args()

    west, south, east, north = (float(part) for part in args.bbox.split(","))
    tifs = sorted(glob.glob(os.path.join(args.dem_dir, "*.tif")))
    if not tifs:
        print(f"no GeoTIFFs found in {args.dem_dir}", file=sys.stderr)
        return 1

    vrt = gdal.BuildVRT("/vsimem/dem.vrt", tifs)

    if os.path.exists(args.out):
        os.remove(args.out)
    db = sqlite3.connect(args.out)
    db.executescript(
        """
        CREATE TABLE metadata (name TEXT, value TEXT);
        CREATE TABLE tiles (
          zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB
        );
        CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);
        """
    )
    db.executemany(
        "INSERT INTO metadata (name, value) VALUES (?, ?)",
        [
            ("name", args.name),
            ("format", "png"),
            ("type", "baselayer"),
            ("encoding", "terrarium"),
            ("bounds", f"{west},{south},{east},{north}"),
            ("minzoom", str(args.min_zoom)),
            ("maxzoom", str(args.max_zoom)),
            ("attribution", args.attribution),
        ],
    )

    total = 0
    for zoom in range(args.min_zoom, args.max_zoom + 1):
        x0, y0 = lonlat_to_tile(west, north, zoom)
        x1, y1 = lonlat_to_tile(east, south, zoom)
        bounds = tile_range_bounds_3857(zoom, x0, y0, x1, y1)
        width = (x1 - x0 + 1) * TILE_SIZE
        height = (y1 - y0 + 1) * TILE_SIZE
        warped = gdal.Warp(
            "",
            vrt,
            format="MEM",
            dstSRS="EPSG:3857",
            outputBounds=bounds,
            width=width,
            height=height,
            resampleAlg="bilinear",
            outputType=gdal.GDT_Float32,
            dstNodata=0.0,
        )
        mosaic = warped.ReadAsArray()
        mosaic = np.nan_to_num(mosaic, nan=0.0)

        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                row = (y - y0) * TILE_SIZE
                col = (x - x0) * TILE_SIZE
                window = mosaic[row : row + TILE_SIZE, col : col + TILE_SIZE]
                png = encode_png(terrarium_encode(window, args.precision_m))
                tms_row = (2**zoom - 1) - y
                db.execute(
                    "INSERT INTO tiles VALUES (?, ?, ?, ?)",
                    (zoom, x, tms_row, sqlite3.Binary(png)),
                )
                total += 1
        db.commit()
        print(f"zoom {zoom}: {(x1 - x0 + 1) * (y1 - y0 + 1)} tiles")

    db.commit()
    db.close()
    print(f"wrote {total} terrarium tiles to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
