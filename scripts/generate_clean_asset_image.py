#!/usr/bin/env python3
"""Stub clean-asset-image generator.

This version does not call a real image generation backend. It writes a metadata file
showing the expected request shape and creates a placeholder text file representing the output.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
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


def crop_with_pillow(source: Path, out: Path, bbox: list[int]) -> bool:
    try:
        from PIL import Image
    except ImportError:
        return False

    x, y, w, h = bbox
    with Image.open(source) as image:
        image.crop((x, y, x + w, y + h)).save(out)
    return True


def crop_with_sips(source: Path, out: Path, bbox: list[int]) -> bool:
    if shutil.which("sips") is None:
        return False

    x, y, w, h = bbox
    subprocess.run(
        [
            "sips",
            "-c",
            str(h),
            str(w),
            "--cropOffset",
            str(y),
            str(x),
            str(source),
            "--out",
            str(out),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    return True


def write_source_crop(scene: dict, obj: dict, out: Path) -> str:
    source = Path(scene.get("source_image", ""))
    bbox = obj.get("bbox_pixels")
    if not source.exists() or not bbox:
        return "missing_source_or_bbox"
    if crop_with_pillow(source, out, bbox):
        return "source_crop_pillow"
    if crop_with_sips(source, out, bbox):
        return "source_crop_sips"
    return "crop_tool_unavailable"


def main() -> None:
    args = parse_args()
    scene = json.loads(Path(args.scene).read_text())
    obj = next((o for o in scene.get("objects", []) if o["id"] == args.asset), None)
    if obj is None:
        raise SystemExit(f"Asset not found: {args.asset}")

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    image_out = outdir / f"{args.asset}_clean.png"

    prompt = (
        f"Generate a clean isolated 3D-style concept render of the object '{obj['name']}'. "
        f"Preserve the look from the source scene. Remove background clutter. "
        f"Use a {args.background} background and a {args.style} look. "
        f"Object notes: {obj.get('notes', '')}"
    )

    artifact_status = "dry_run"
    if not args.dry_run:
        artifact_status = write_source_crop(scene, obj, image_out)

    meta = {
        "asset_id": args.asset,
        "backend": args.backend,
        "mode": args.mode,
        "views": args.views,
        "background": args.background,
        "style": args.style,
        "prompt": prompt,
        "source_image": scene.get("source_image"),
        "source_bbox_pixels": obj.get("bbox_pixels"),
        "image_output": str(image_out) if artifact_status.startswith("source_crop") else None,
        "artifact_status": artifact_status,
        "dry_run": args.dry_run,
        "status": "stub_crop_only",
    }
    (outdir / f"{args.asset}_clean_meta.json").write_text(json.dumps(meta, indent=2))
    (outdir / f"{args.asset}_clean.txt").write_text(
        "Placeholder clean-render request. Current stub also writes a source crop PNG when image tools are available.\n"
    )
    print(f"Wrote clean-asset stub outputs to {outdir}")


if __name__ == "__main__":
    main()
