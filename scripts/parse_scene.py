#!/usr/bin/env python3
"""Stub scene parser for the Pixel Town 3D POC.

This script is intentionally lightweight. It does not call a real VLM yet.
Instead it emits a structured starter inventory that downstream tools can use.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

DEFAULT_OBJECTS = [
    {
        "id": "shrine_01",
        "name": "shrine",
        "category": "hero_structure",
        "bbox": [0.00, 0.18, 0.17, 0.66],
        "depth_band": "foreground",
        "priority": "high",
        "reusable": True,
        "occlusion": "medium",
        "complexity": "high",
        "notes": "Traditional shrine/temple on a stone terrace on the far left.",
    },
    {
        "id": "house_blue_01",
        "name": "blue roof house",
        "category": "modular_building",
        "bbox": [0.41, 0.25, 0.10, 0.46],
        "depth_band": "foreground",
        "priority": "high",
        "reusable": True,
        "occlusion": "low",
        "complexity": "medium",
        "notes": "Distinctive blue-roof house near center-left.",
    },
    {
        "id": "park_01",
        "name": "park",
        "category": "environment_chunk",
        "bbox": [0.63, 0.33, 0.13, 0.25],
        "depth_band": "midground",
        "priority": "medium",
        "reusable": False,
        "occlusion": "low",
        "complexity": "medium",
        "notes": "Small park/playground area near the intersection.",
    },
    {
        "id": "station_01",
        "name": "station",
        "category": "hero_structure",
        "bbox": [0.83, 0.28, 0.17, 0.36],
        "depth_band": "foreground",
        "priority": "high",
        "reusable": True,
        "occlusion": "low",
        "complexity": "high",
        "notes": "Train station platform and shelter on the far right.",
    },
    {
        "id": "train_01",
        "name": "train",
        "category": "vehicle",
        "bbox": [0.88, 0.38, 0.11, 0.18],
        "depth_band": "foreground",
        "priority": "medium",
        "reusable": True,
        "occlusion": "low",
        "complexity": "medium",
        "notes": "Green-and-cream local train at the station.",
    },
    {
        "id": "utility_poles_01",
        "name": "utility poles and wires",
        "category": "infrastructure",
        "bbox": [0.56, 0.05, 0.39, 0.50],
        "depth_band": "all",
        "priority": "high",
        "reusable": True,
        "occlusion": "low",
        "complexity": "medium",
        "notes": "Power poles and wires spanning the roads.",
    },
    {
        "id": "vending_machine_01",
        "name": "vending machine",
        "category": "prop",
        "bbox": [0.82, 0.48, 0.06, 0.20],
        "depth_band": "foreground",
        "priority": "medium",
        "reusable": True,
        "occlusion": "low",
        "complexity": "low",
        "notes": "Blue vending machine near the station.",
    },
]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--image", required=True, help="Path to source panorama image")
    p.add_argument("--out", required=True, help="Output JSON path")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source_image": args.image,
        "scene_summary": "A pixel-art seaside town scene with shrine, blue-roof houses, road intersection, park, station, train, utility poles, ocean and mountains.",
        "objects": DEFAULT_OBJECTS,
        "generator": "stub_scene_parser_v1",
    }
    out.write_text(json.dumps(payload, indent=2))
    print(f"Wrote scene parse stub to {out}")


if __name__ == "__main__":
    main()
