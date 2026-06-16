#!/usr/bin/env python3
"""Stub scene parser for the Pixel Town 3D POC.

This script is intentionally lightweight. It does not call a real VLM yet.
Instead it emits a structured starter inventory that downstream tools can use.
"""
from __future__ import annotations

import argparse
import json
import struct
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
    p.add_argument(
        "--allow-missing-image",
        action="store_true",
        help="Write the stub inventory even when the source image is unavailable",
    )
    return p.parse_args()


def read_image_size(path: Path) -> tuple[int, int]:
    """Read PNG or JPEG dimensions without adding an image-library dependency."""
    with path.open("rb") as f:
        header = f.read(24)
        if header.startswith(b"\x89PNG\r\n\x1a\n"):
            width, height = struct.unpack(">II", header[16:24])
            return width, height

        if header[:2] != b"\xff\xd8":
            raise ValueError(f"Unsupported image format: {path}")

        f.seek(2)
        while True:
            marker_start = f.read(1)
            if not marker_start:
                break
            if marker_start != b"\xff":
                continue
            marker = f.read(1)
            while marker == b"\xff":
                marker = f.read(1)
            if marker in {b"\xd8", b"\xd9"}:
                continue
            length_bytes = f.read(2)
            if len(length_bytes) != 2:
                break
            segment_length = struct.unpack(">H", length_bytes)[0]
            if marker in {
                b"\xc0",
                b"\xc1",
                b"\xc2",
                b"\xc3",
                b"\xc5",
                b"\xc6",
                b"\xc7",
                b"\xc9",
                b"\xca",
                b"\xcb",
                b"\xcd",
                b"\xce",
                b"\xcf",
            }:
                data = f.read(5)
                if len(data) != 5:
                    break
                height, width = struct.unpack(">HH", data[1:5])
                return width, height
            f.seek(segment_length - 2, 1)

    raise ValueError(f"Could not read image dimensions: {path}")


def with_pixel_bboxes(objects: list[dict], width: int, height: int) -> list[dict]:
    enriched = []
    for obj in objects:
        item = dict(obj)
        x, y, w, h = item["bbox"]
        item["bbox_pixels"] = [
            round(x * width),
            round(y * height),
            round(w * width),
            round(h * height),
        ]
        enriched.append(item)
    return enriched


def main() -> None:
    args = parse_args()
    image = Path(args.image)
    image_width = None
    image_height = None
    image_status = "missing"
    objects = DEFAULT_OBJECTS

    if image.exists():
        image_width, image_height = read_image_size(image)
        image_status = "found"
        objects = with_pixel_bboxes(DEFAULT_OBJECTS, image_width, image_height)
    elif not args.allow_missing_image:
        raise SystemExit(
            f"Source image not found: {image}. "
            "Pass --allow-missing-image to emit the stub inventory anyway."
        )

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source_image": args.image,
        "source_image_status": image_status,
        "source_image_width": image_width,
        "source_image_height": image_height,
        "scene_summary": "A pixel-art seaside town scene with shrine, blue-roof houses, road intersection, park, station, train, utility poles, ocean and mountains.",
        "objects": objects,
        "generator": "stub_scene_parser_v1",
    }
    out.write_text(json.dumps(payload, indent=2))
    print(f"Wrote scene parse stub to {out}")


if __name__ == "__main__":
    main()
