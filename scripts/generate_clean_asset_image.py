#!/usr/bin/env python3
"""Stub clean-asset-image generator.

This version does not call a real image generation backend. It writes a metadata file
showing the expected request shape and creates a placeholder text file representing the output.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--asset", required=True)
    p.add_argument("--scene", required=True)
    p.add_argument("--mode", default="clean-render", choices=["clean-render"])
    p.add_argument("--views", default="single", choices=["single", "turntable4"])
    p.add_argument("--background", default="transparent", choices=["transparent", "white", "studio"])
    p.add_argument("--style", default="pixel-friendly", choices=["pixel-friendly", "toon", "neutral-3d"])
    p.add_argument("--backend", default="stub")
    p.add_argument("--outdir", required=True)
    p.add_argument("--dry-run", action="store_true")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    scene = json.loads(Path(args.scene).read_text())
    obj = next((o for o in scene.get("objects", []) if o["id"] == args.asset), None)
    if obj is None:
        raise SystemExit(f"Asset not found: {args.asset}")

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    stem = outdir / f"{args.asset}_clean"

    prompt = (
        f"Generate a clean isolated 3D-style concept render of the object '{obj['name']}'. "
        f"Preserve the look from the source scene. Remove background clutter. "
        f"Use a {args.background} background and a {args.style} look. "
        f"Object notes: {obj.get('notes', '')}"
    )

    meta = {
        "asset_id": args.asset,
        "backend": args.backend,
        "mode": args.mode,
        "views": args.views,
        "background": args.background,
        "style": args.style,
        "prompt": prompt,
        "dry_run": args.dry_run,
        "status": "stub_only",
    }
    (outdir / f"{args.asset}_clean_meta.json").write_text(json.dumps(meta, indent=2))
    # Placeholder artifact to show expected path.
    (outdir / f"{args.asset}_clean.txt").write_text(
        "Placeholder for clean asset image output. Replace with PNG output from a real backend.\n"
    )
    print(f"Wrote clean-asset stub outputs to {outdir}")


if __name__ == "__main__":
    main()
