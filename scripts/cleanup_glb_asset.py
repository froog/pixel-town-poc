#!/usr/bin/env python3
"""Clean a generated GLB for browser-scene integration.

The first target is TripoSR output: preserve vertex colors, remove tiny floating
components, normalize origin/grounding, and write metadata for review.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import trimesh


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True, help="Input raw GLB")
    p.add_argument("--out", required=True, help="Output cleaned GLB")
    p.add_argument("--meta", help="Output cleanup metadata JSON")
    p.add_argument("--min-faces", type=int, default=128, help="Drop components smaller than this")
    p.add_argument("--target-height", type=float, help="Scale vertical extent to this size")
    p.add_argument("--up-axis", choices=["x", "y", "z"], default="y")
    return p.parse_args()


def load_as_mesh(path: Path) -> trimesh.Trimesh:
    loaded = trimesh.load(path)
    if isinstance(loaded, trimesh.Scene):
        meshes = [geom for geom in loaded.geometry.values() if isinstance(geom, trimesh.Trimesh)]
        if not meshes:
            raise SystemExit(f"No mesh geometry found in {path}")
        return trimesh.util.concatenate(meshes)
    if isinstance(loaded, trimesh.Trimesh):
        return loaded
    raise SystemExit(f"Unsupported GLB contents: {path}")


def component_stats(meshes: list[trimesh.Trimesh]) -> list[dict]:
    stats = []
    for i, mesh in enumerate(meshes):
        stats.append(
            {
                "index": i,
                "vertices": int(len(mesh.vertices)),
                "faces": int(len(mesh.faces)),
                "extents": [float(v) for v in mesh.extents],
            }
        )
    return stats


def normalize(mesh: trimesh.Trimesh, up_axis: str, target_height: float | None) -> dict:
    axis = {"x": 0, "y": 1, "z": 2}[up_axis]
    before_bounds = mesh.bounds.copy()

    if target_height:
        height = float(mesh.extents[axis])
        if height > 0:
            mesh.apply_scale(target_height / height)

    bounds = mesh.bounds
    translation = np.zeros(3)
    horizontal_axes = [0, 1, 2]
    horizontal_axes.remove(axis)
    for h_axis in horizontal_axes:
        translation[h_axis] = -float((bounds[0, h_axis] + bounds[1, h_axis]) / 2.0)
    translation[axis] = -float(bounds[0, axis])
    mesh.apply_translation(translation)

    return {
        "up_axis": up_axis,
        "target_height": target_height,
        "input_bounds": before_bounds.tolist(),
        "output_bounds": mesh.bounds.tolist(),
        "translation": translation.tolist(),
    }


def main() -> None:
    args = parse_args()
    source = Path(args.input)
    out = Path(args.out)
    meta_path = Path(args.meta) if args.meta else out.with_suffix(".cleanup_meta.json")

    mesh = load_as_mesh(source)
    components = sorted(mesh.split(only_watertight=False), key=lambda m: len(m.faces), reverse=True)
    kept = [component for component in components if len(component.faces) >= args.min_faces]
    if not kept and components:
        kept = [components[0]]
    if not kept:
        raise SystemExit(f"No mesh components found in {source}")

    cleaned = trimesh.util.concatenate(kept)
    transform_meta = normalize(cleaned, args.up_axis, args.target_height)

    out.parent.mkdir(parents=True, exist_ok=True)
    cleaned.export(out)

    meta = {
        "input": str(source),
        "output": str(out),
        "input_vertices": int(len(mesh.vertices)),
        "input_faces": int(len(mesh.faces)),
        "input_components": component_stats(components),
        "kept_components": len(kept),
        "dropped_components": max(0, len(components) - len(kept)),
        "output_vertices": int(len(cleaned.vertices)),
        "output_faces": int(len(cleaned.faces)),
        "output_is_watertight": bool(cleaned.is_watertight),
        "has_vertex_colors": bool(
            hasattr(cleaned.visual, "vertex_colors") and len(cleaned.visual.vertex_colors) > 0
        ),
        "transform": transform_meta,
    }
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"Wrote cleaned GLB to {out}")
    print(f"Wrote cleanup metadata to {meta_path}")


if __name__ == "__main__":
    main()
