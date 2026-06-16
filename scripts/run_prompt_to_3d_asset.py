#!/usr/bin/env python3
"""Generate 3D assets directly from object metadata prompts.

The first real backend is deliberately parametric: it builds simple colored GLB
geometry from the parsed object metadata. This gives the project a fast local
baseline for browser-friendly assets before wiring paid text-to-3D APIs.
"""
from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path


Color = tuple[float, float, float, float]
Vec3 = tuple[float, float, float]


COLORS: dict[str, Color] = {
    "wood": (0.66, 0.45, 0.27, 1.0),
    "dark_wood": (0.42, 0.25, 0.14, 1.0),
    "roof_blue": (0.28, 0.46, 0.62, 1.0),
    "wall": (0.78, 0.72, 0.62, 1.0),
    "stone": (0.48, 0.50, 0.52, 1.0),
    "vending_blue": (0.08, 0.28, 0.62, 1.0),
    "cream": (0.86, 0.80, 0.62, 1.0),
    "green": (0.15, 0.42, 0.34, 1.0),
    "glass": (0.55, 0.78, 0.86, 1.0),
    "metal": (0.62, 0.64, 0.66, 1.0),
    "wire": (0.08, 0.08, 0.08, 1.0),
}


class MeshBuilder:
    def __init__(self) -> None:
        self.primitives: list[dict] = []

    def add_primitive(self, positions: list[Vec3], indices: list[int], color: Color) -> None:
        self.primitives.append({"positions": positions, "indices": indices, "color": color})

    def add_box(self, center: Vec3, size: Vec3, color: Color) -> None:
        cx, cy, cz = center
        sx, sy, sz = (size[0] / 2.0, size[1] / 2.0, size[2] / 2.0)
        vertices = [
            (cx - sx, cy - sy, cz - sz),
            (cx + sx, cy - sy, cz - sz),
            (cx + sx, cy + sy, cz - sz),
            (cx - sx, cy + sy, cz - sz),
            (cx - sx, cy - sy, cz + sz),
            (cx + sx, cy - sy, cz + sz),
            (cx + sx, cy + sy, cz + sz),
            (cx - sx, cy + sy, cz + sz),
        ]
        indices = [
            0, 1, 2, 0, 2, 3,
            1, 5, 6, 1, 6, 2,
            5, 4, 7, 5, 7, 6,
            4, 0, 3, 4, 3, 7,
            3, 2, 6, 3, 6, 7,
            4, 5, 1, 4, 1, 0,
        ]
        self.add_primitive(vertices, indices, color)

    def add_gable_roof(self, center: Vec3, size: Vec3, color: Color) -> None:
        cx, cy, cz = center
        sx, sy, sz = (size[0] / 2.0, size[1], size[2] / 2.0)
        base_y = cy - sy / 2.0
        ridge_y = cy + sy / 2.0
        vertices = [
            (cx - sx, base_y, cz - sz),
            (cx + sx, base_y, cz - sz),
            (cx, ridge_y, cz - sz),
            (cx - sx, base_y, cz + sz),
            (cx + sx, base_y, cz + sz),
            (cx, ridge_y, cz + sz),
        ]
        indices = [
            0, 1, 2,
            3, 5, 4,
            0, 3, 4, 0, 4, 1,
            1, 4, 5, 1, 5, 2,
            2, 5, 3, 2, 3, 0,
        ]
        self.add_primitive(vertices, indices, color)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--asset", required=True)
    p.add_argument("--scene", required=True)
    p.add_argument("--routes", required=True)
    p.add_argument("--backend", default="stub", choices=["stub", "parametric"])
    p.add_argument("--outdir", required=True)
    p.add_argument("--output-suffix", default="_prompt3d")
    return p.parse_args()


def align4(data: bytes, pad: bytes = b" ") -> bytes:
    return data + pad * ((4 - len(data) % 4) % 4)


def accessor_min_max(positions: list[Vec3]) -> tuple[list[float], list[float]]:
    return (
        [min(vertex[i] for vertex in positions) for i in range(3)],
        [max(vertex[i] for vertex in positions) for i in range(3)],
    )


def write_glb(path: Path, builder: MeshBuilder) -> dict:
    if not builder.primitives:
        raise SystemExit("Cannot write an empty GLB")

    json_doc: dict = {
        "asset": {"version": "2.0", "generator": "pixel-town-parametric-v1"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "asset_root"}],
        "meshes": [{"name": path.stem, "primitives": []}],
        "materials": [],
        "buffers": [],
        "bufferViews": [],
        "accessors": [],
    }
    binary = bytearray()
    all_positions: list[Vec3] = []

    for primitive in builder.primitives:
        positions = primitive["positions"]
        indices = primitive["indices"]
        color = primitive["color"]
        all_positions.extend(positions)

        position_offset = len(binary)
        for vertex in positions:
            binary.extend(struct.pack("<3f", *vertex))
        while len(binary) % 4:
            binary.extend(b"\x00")
        position_view = len(json_doc["bufferViews"])
        json_doc["bufferViews"].append(
            {"buffer": 0, "byteOffset": position_offset, "byteLength": len(positions) * 12}
        )
        pos_min, pos_max = accessor_min_max(positions)
        position_accessor = len(json_doc["accessors"])
        json_doc["accessors"].append(
            {
                "bufferView": position_view,
                "componentType": 5126,
                "count": len(positions),
                "type": "VEC3",
                "min": pos_min,
                "max": pos_max,
            }
        )

        index_offset = len(binary)
        for index in indices:
            binary.extend(struct.pack("<H", index))
        while len(binary) % 4:
            binary.extend(b"\x00")
        index_view = len(json_doc["bufferViews"])
        json_doc["bufferViews"].append(
            {"buffer": 0, "byteOffset": index_offset, "byteLength": len(indices) * 2}
        )
        index_accessor = len(json_doc["accessors"])
        json_doc["accessors"].append(
            {
                "bufferView": index_view,
                "componentType": 5123,
                "count": len(indices),
                "type": "SCALAR",
                "min": [0],
                "max": [max(indices)],
            }
        )

        material = len(json_doc["materials"])
        json_doc["materials"].append(
            {
                "pbrMetallicRoughness": {
                    "baseColorFactor": list(color),
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.8,
                },
                "doubleSided": True,
            }
        )
        json_doc["meshes"][0]["primitives"].append(
            {
                "attributes": {"POSITION": position_accessor},
                "indices": index_accessor,
                "material": material,
                "mode": 4,
            }
        )

    json_doc["buffers"].append({"byteLength": len(binary)})
    json_bytes = align4(json.dumps(json_doc, separators=(",", ":")).encode("utf-8"), b" ")
    bin_bytes = align4(bytes(binary), b"\x00")
    total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as fh:
        fh.write(struct.pack("<4sII", b"glTF", 2, total_length))
        fh.write(struct.pack("<I4s", len(json_bytes), b"JSON"))
        fh.write(json_bytes)
        fh.write(struct.pack("<I4s", len(bin_bytes), b"BIN\x00"))
        fh.write(bin_bytes)

    mins, maxs = accessor_min_max(all_positions)
    return {
        "vertices": sum(len(p["positions"]) for p in builder.primitives),
        "triangles": sum(len(p["indices"]) // 3 for p in builder.primitives),
        "primitives": len(builder.primitives),
        "bounds": {"min": mins, "max": maxs},
    }


def prompt_for(obj: dict) -> str:
    return (
        "Create a single low-poly browser-game 3D asset.\n"
        f"Object: {obj.get('name')}.\n"
        f"Category: {obj.get('category')}.\n"
        f"Source notes: {obj.get('notes')}.\n"
        "Style: clean stylized low-poly, pixel-town compatible, readable silhouette.\n"
        "Constraints: single object only, no background, no scene, no people, "
        "centered origin, game-ready GLB, modest polygon count."
    )


def build_parametric(obj: dict) -> tuple[MeshBuilder, list[str]]:
    name = obj.get("name", "")
    category = obj.get("category", "")
    mesh = MeshBuilder()
    notes: list[str] = []

    if name == "vending machine":
        mesh.add_box((0, 0.9, 0), (0.7, 1.8, 0.45), COLORS["vending_blue"])
        mesh.add_box((0.02, 1.15, 0.235), (0.42, 0.55, 0.04), COLORS["glass"])
        mesh.add_box((0.0, 0.55, 0.24), (0.48, 0.16, 0.04), COLORS["metal"])
        mesh.add_box((0.25, 0.92, 0.245), (0.11, 0.32, 0.04), COLORS["cream"])
        notes.append("Built vending machine from simple colored boxes.")
    elif name == "blue roof house" or category == "modular_building":
        mesh.add_box((0, 0.55, 0), (1.3, 1.1, 0.9), COLORS["wall"])
        mesh.add_gable_roof((0, 1.32, 0), (1.55, 0.65, 1.05), COLORS["roof_blue"])
        mesh.add_box((-0.32, 0.55, 0.46), (0.26, 0.32, 0.04), COLORS["glass"])
        mesh.add_box((0.35, 0.45, 0.46), (0.28, 0.58, 0.04), COLORS["dark_wood"])
        notes.append("Built modular house with body, blue gable roof, door, and window.")
    elif name == "train" or category == "vehicle":
        mesh.add_box((0, 0.42, 0), (2.4, 0.72, 0.55), COLORS["cream"])
        mesh.add_box((0, 0.76, 0), (2.45, 0.16, 0.58), COLORS["green"])
        for x in (-0.72, 0.0, 0.72):
            mesh.add_box((x, 0.52, 0.295), (0.36, 0.22, 0.04), COLORS["glass"])
        mesh.add_box((0, 0.12, 0), (2.25, 0.12, 0.5), COLORS["metal"])
        notes.append("Built local train as a simplified cream-and-green rail car.")
    elif name == "shrine":
        mesh.add_box((0, 0.12, 0), (1.35, 0.24, 1.05), COLORS["stone"])
        mesh.add_box((0, 0.58, 0), (0.95, 0.75, 0.62), COLORS["wood"])
        mesh.add_gable_roof((0, 1.12, 0), (1.35, 0.55, 0.92), COLORS["roof_blue"])
        mesh.add_box((0, 0.48, 0.335), (0.34, 0.5, 0.04), COLORS["dark_wood"])
        mesh.add_box((0, 0.08, 0.72), (0.72, 0.12, 0.28), COLORS["stone"])
        notes.append("Built simple shrine with stone base, wooden body, roof, door, and step.")
    elif name == "station":
        mesh.add_box((0, 0.08, 0), (1.8, 0.16, 0.8), COLORS["stone"])
        mesh.add_box((-0.48, 0.62, 0), (0.55, 0.92, 0.52), COLORS["wall"])
        mesh.add_gable_roof((-0.48, 1.2, 0), (0.8, 0.38, 0.7), COLORS["roof_blue"])
        mesh.add_box((0.45, 0.62, 0), (0.9, 0.08, 0.7), COLORS["roof_blue"])
        notes.append("Built station as a small shelter and platform proxy.")
    elif category == "infrastructure":
        for x in (-0.75, 0.75):
            mesh.add_box((x, 0.85, 0), (0.08, 1.7, 0.08), COLORS["dark_wood"])
            mesh.add_box((x, 1.45, 0), (0.45, 0.07, 0.07), COLORS["dark_wood"])
        mesh.add_box((0, 1.55, 0), (1.55, 0.025, 0.025), COLORS["wire"])
        mesh.add_box((0, 1.35, 0.12), (1.55, 0.025, 0.025), COLORS["wire"])
        notes.append("Built utility poles and wires as thin box geometry.")
    else:
        mesh.add_box((0, 0.5, 0), (1.0, 1.0, 1.0), COLORS["metal"])
        notes.append("Built generic placeholder box for unsupported object type.")

    return mesh, notes


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
    prompt_path = outdir / f"{stem}_prompt.txt"
    meta_path = outdir / f"{stem}_generation_meta.json"
    notes_path = outdir / f"{stem}_notes.md"
    prompt = prompt_for(obj)

    backend_meta: dict = {}
    if args.backend == "stub":
        raw.write_bytes(b"glTF placeholder for future direct prompt-to-3D asset\n")
        status = "stub_only"
        notes = ["Stub backend wrote a placeholder file only."]
    elif args.backend == "parametric":
        builder, notes = build_parametric(obj)
        backend_meta = write_glb(raw, builder)
        status = "generated"
    else:
        raise SystemExit(f"Backend not implemented yet: {args.backend}")

    prompt_path.write_text(prompt + "\n")
    meta_path.write_text(
        json.dumps(
            {
                "asset_id": args.asset,
                "asset_name": obj.get("name"),
                "route": route,
                "backend": args.backend,
                "status": status,
                "prompt_path": str(prompt_path),
                "output": str(raw),
                "backend_meta": backend_meta,
                "next_step": "Review GLB, then run cleanup/normalisation before browser placement",
            },
            indent=2,
        )
    )
    notes_path.write_text(
        f"# Direct Prompt-To-3D Notes: {args.asset}\n\n"
        f"- Name: {obj.get('name')}\n"
        f"- Backend: {args.backend}\n"
        f"- Route recommendation: {route['route'] if route else 'unknown'}\n"
        f"- Status: {status}\n"
        + "".join(f"- {note}\n" for note in notes)
    )
    print(f"Wrote direct prompt-to-3D outputs to {outdir}")


if __name__ == "__main__":
    main()
