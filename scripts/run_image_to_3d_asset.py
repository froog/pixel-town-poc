#!/usr/bin/env python3
"""Stub image-to-3D runner for the Pixel Town 3D POC."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--asset", required=True)
    p.add_argument("--scene", required=True)
    p.add_argument("--routes", required=True)
    p.add_argument("--mode", default="direct", choices=["direct", "clean-render", "multiview"])
    p.add_argument("--backend", default="stub", choices=["stub", "hunyuan3d", "trellis", "tripo", "manual"])
    p.add_argument("--outdir", required=True)
    p.add_argument("--tripo-repo", default=os.environ.get("TRIPOSR_REPO"))
    p.add_argument("--tripo-python", default=os.environ.get("TRIPOSR_PYTHON", "python"))
    p.add_argument("--device", default="cpu")
    p.add_argument("--mc-resolution", default=128, type=int)
    p.add_argument("--chunk-size", default=4096, type=int)
    p.add_argument("--input-image", help="Override resolved image input for real backends")
    p.add_argument("--output-suffix", default="", help="Suffix to append after asset id in output filenames")
    return p.parse_args()


def resolve_input_image(args: argparse.Namespace, scene: dict) -> Path:
    if args.input_image:
        return Path(args.input_image)
    scene_path = Path(args.scene)
    assets_root = scene_path.parent
    if args.mode == "clean-render":
        return assets_root / "intermediate" / f"{args.asset}_clean.png"
    if args.mode == "direct":
        return Path(scene["source_image"])
    raise SystemExit(f"Mode is not implemented for backend input resolution: {args.mode}")


def run_tripo(args: argparse.Namespace, scene: dict, raw: Path) -> dict:
    if not args.tripo_repo:
        raise SystemExit("Tripo backend requires --tripo-repo or TRIPOSR_REPO")

    repo = Path(args.tripo_repo)
    run_py = repo / "run.py"
    if not run_py.exists():
        raise SystemExit(f"Tripo run.py not found: {run_py}")

    input_image = resolve_input_image(args, scene)
    if not input_image.exists():
        raise SystemExit(f"Input image not found for Tripo backend: {input_image}")

    with tempfile.TemporaryDirectory(prefix=f"{args.asset}_tripo_") as tmp:
        cmd = [
            args.tripo_python,
            str(run_py),
            str(input_image.resolve()),
            "--device",
            args.device,
            "--output-dir",
            tmp,
            "--model-save-format",
            "glb",
            "--mc-resolution",
            str(args.mc_resolution),
            "--chunk-size",
            str(args.chunk_size),
        ]
        subprocess.run(cmd, cwd=repo, check=True)
        mesh = Path(tmp) / "0" / "mesh.glb"
        processed_input = Path(tmp) / "0" / "input.png"
        if not mesh.exists():
            raise SystemExit(f"Tripo did not write expected mesh: {mesh}")
        shutil.copyfile(mesh, raw)
        if processed_input.exists():
            shutil.copyfile(processed_input, raw.with_name(f"{raw.stem}_input.png"))

    return {
        "input_image": str(input_image),
        "tripo_repo": str(repo),
        "device": args.device,
        "mc_resolution": args.mc_resolution,
        "chunk_size": args.chunk_size,
    }


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
    stem = f"{args.asset}{args.output_suffix}"
    raw = outdir / f"{stem}_raw.glb"
    meta = outdir / f"{stem}_generation_meta.json"
    notes = outdir / f"{stem}_notes.md"

    backend_meta = {}
    if args.backend == "stub":
        raw.write_bytes(b"glTF placeholder for future generated asset\n")
        status = "stub_only"
        next_step = "Replace stub with backend-specific invocation and valid GLB output"
    elif args.backend == "tripo":
        backend_meta = run_tripo(args, scene, raw)
        status = "generated"
        next_step = "Review mesh quality, then run cleanup/normalisation before world integration"
    else:
        raise SystemExit(f"Backend not implemented yet: {args.backend}")

    meta.write_text(json.dumps({
        "asset_id": args.asset,
        "asset_name": obj.get("name"),
        "route": route,
        "mode": args.mode,
        "backend": args.backend,
        "status": status,
        "backend_meta": backend_meta,
        "next_step": next_step,
    }, indent=2))
    notes.write_text(
        f"# Asset Generation Notes: {args.asset}\n\n"
        f"- Name: {obj.get('name')}\n"
        f"- Mode: {args.mode}\n"
        f"- Backend: {args.backend}\n"
        f"- Route recommendation: {route['route'] if route else 'unknown'}\n"
        f"- Status: {status}\n"
        f"- Next step: {next_step}\n"
    )
    print(f"Wrote image-to-3D outputs to {outdir}")


if __name__ == "__main__":
    main()
