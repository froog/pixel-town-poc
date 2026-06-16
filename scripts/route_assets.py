#!/usr/bin/env python3
"""Route scene assets to generation strategies."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def choose_route(obj: dict) -> tuple[str, list[str]]:
    name = obj.get("name", "")
    category = obj.get("category", "")
    complexity = obj.get("complexity", "")
    occlusion = obj.get("occlusion", "")

    if category in {"infrastructure", "environment_chunk"} and name != "vending machine":
        return "procedural", ["simple modular geometry preferred", "better performance", "repeatable"]
    if name in {"vending machine", "shrine", "station"}:
        return "clean_render_then_i23d", ["hero or prop asset", "benefits from clean silhouette"]
    if name in {"blue roof house", "train"}:
        return "direct_crop_to_i23d", ["clear enough source crop for baseline"]
    if complexity == "high" and occlusion == "medium":
        return "clean_render_then_i23d", ["complex asset", "partly occluded"]
    return "manual_model", ["fallback route"]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--scene", required=True, help="Path to scene_parse.json")
    p.add_argument("--out", required=True, help="Output routes JSON path")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    data = json.loads(Path(args.scene).read_text())
    routes = []
    for obj in data.get("objects", []):
        route, reasons = choose_route(obj)
        routes.append({"asset_id": obj["id"], "route": route, "reason": reasons})
    payload = {"source_scene": args.scene, "routes": routes, "generator": "stub_router_v1"}
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2))
    print(f"Wrote asset routes to {out}")


if __name__ == "__main__":
    main()
