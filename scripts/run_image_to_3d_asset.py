#!/usr/bin/env python3
"""Stub image-to-3D runner for the Pixel Town 3D POC."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--asset", required=True)
    p.add_argument("--scene", required=True)
    p.add_argument("--routes", required=True)
    p.add_argument("--mode", default="direct", choices=["direct", "clean-render", "multiview"])
    p.add_argument("--backend", default="stub", choices=["stub", "hunyuan3d", "trellis", "tripo", "manual"])
    p.add_argument("--outdir", required=True)
    return p.parse_args()


def main() -> None:
    args = parse_args()
    scene = json.loads(Path(args.scene).read_text())
    routes = json.loads(Path(args.routes).read_text())
    obj = next((o for o in scene.get("objects", []) if o["id"] == args.asset), None)
    if obj is None:
        raise SystemExit(f"Asset not found: {args.asset}")
    route = next((r for r in routes.get("routes", []) if r["asset_id"] == args.asset), None)

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    raw = outdir / f"{args.asset}_raw.glb"
    meta = outdir / f"{args.asset}_generation_meta.json"
    notes = outdir / f"{args.asset}_notes.md"

    # Placeholder raw artifact.
    raw.write_bytes(b"glTF placeholder for future generated asset\n")
    meta.write_text(json.dumps({
        "asset_id": args.asset,
        "asset_name": obj.get("name"),
        "route": route,
        "mode": args.mode,
        "backend": args.backend,
        "status": "stub_only",
        "next_step": "Replace stub with backend-specific invocation and valid GLB output",
    }, indent=2))
    notes.write_text(
        f"# Asset Generation Notes: {args.asset}\n\n"
        f"- Name: {obj.get('name')}\n"
        f"- Mode: {args.mode}\n"
        f"- Backend: {args.backend}\n"
        f"- Route recommendation: {route['route'] if route else 'unknown'}\n"
        f"- Stub output only. Replace with real backend integration.\n"
    )
    print(f"Wrote stub image-to-3D outputs to {outdir}")


if __name__ == "__main__":
    main()
