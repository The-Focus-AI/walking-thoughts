#!/usr/bin/env python3
"""Print the WGS84 bounding box for a center point and radius in kilometers."""

import argparse
import math

parser = argparse.ArgumentParser()
parser.add_argument("--center", required=True, help="lat,lon")
parser.add_argument("--radius-km", type=float, required=True)
args = parser.parse_args()

lat, lon = (float(part) for part in args.center.split(","))
radius_m = args.radius_km * 1000
dlat = radius_m / 111320
dlon = radius_m / (111320 * math.cos(math.radians(lat)))

print(f"{lon - dlon:.6f},{lat - dlat:.6f},{lon + dlon:.6f},{lat + dlat:.6f}")
