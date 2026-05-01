#!/usr/bin/env python3
"""
Idea Garden Data Adapter — Avi-Claude Workspace

Reads graph_data.json (from knowledge-graph graph_builder.py) and transforms it
into garden_data.json — the format Idea Garden expects.

Key feature: sister plant splitting. If a subfolder has >MAX_NOTES_PER_PLANT files,
it spawns multiple plants in the same color family, linked by matching tags.
"""

import json
import math
import os
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[2].parent  # Avi-Claude root
GRAPH_DATA = WORKSPACE / "Town-Hall" / "Scaffold" / "knowledge-graph" / "graph_data.json"
OUTPUT = Path(__file__).parent / "garden_data.json"

MAX_NOTES_PER_PLANT = 100

# Space → color palette (pairs: primary leaf, secondary leaf)
SPACE_COLORS = {
    "Harbor": {"primary": "#9CA3AF", "secondary": "#6B7280"},
    "Town-Hall": {"primary": "#3B82F6", "secondary": "#93AAFD"},
    "Workshop": {"primary": "#E87040", "secondary": "#FDAA93"},
    "Library": {"primary": "#0D9488", "secondary": "#6EDCD2"},
    "Embassy": {"primary": "#A855F7", "secondary": "#C084FC"},
    "Crossroads": {"primary": "#EF4444", "secondary": "#FCA5A5"},
}

# Exclude submodule-heavy paths that bloat the garden
EXCLUDE_PREFIXES = [
    "Town-Hall/Scaffold/claude-scientific-skills/",
    "Town-Hall/Scaffold/academic-research-skills/",
    "Town-Hall/Scaffold/gstack/",
    "Town-Hall/Scaffold/trailofbits-config/",
    "Crossroads/forethought-starter/",
    "Town-Hall/Scaffold/session-pulser/node_modules/",
    "Town-Hall/Scaffold/cabinet/node_modules/",
    "Town-Hall/User/Web-Presence/",
    "Town-Hall/User/Aesthetics/",
    "Public-Repo/",
]


def should_exclude(path):
    for prefix in EXCLUDE_PREFIXES:
        if path.startswith(prefix):
            return True
    return False


def get_file_mtime(rel_path):
    """Get file modification time as epoch ms."""
    full = WORKSPACE / rel_path
    try:
        return full.stat().st_mtime * 1000
    except OSError:
        return 0


def build_garden_data(graph):
    """Transform graph_data.json into garden_data.json."""
    nodes = graph["nodes"]
    edges = graph.get("edges", [])

    # Filter out excluded paths
    nodes = [n for n in nodes if not should_exclude(n["id"])]

    # Build notes array
    notes = []
    note_id = 0
    id_map = {}  # graph node id → garden note id

    for node in nodes:
        tags = []
        if node.get("canonical"):
            tags.append("canonical")
        if node.get("tier"):
            tags.append(f"tier-{node['tier']}")
        tags.append(node["space"])

        note = {
            "id": note_id,
            "filename": os.path.basename(node["id"]),
            "name": os.path.basename(node["id"]).replace(".md", ""),
            "text": "",  # not needed for visualization
            "text_preview": node.get("title", ""),
            "modifiedAt": get_file_mtime(node["id"]),
            "subfolder": node.get("cluster", node["space"]),
            "tags": tags,
            "space": node["space"],
            "canonical": node.get("canonical", False),
            "tier": node.get("tier"),
            "path": node["id"],
            "in_links": node.get("in_links", 0),
            "out_links": node.get("out_links", 0),
        }
        id_map[node["id"]] = note_id
        notes.append(note)
        note_id += 1

    # Group by subfolder (cluster)
    subfolder_map = {}
    for note in notes:
        key = note["subfolder"]
        if key not in subfolder_map:
            subfolder_map[key] = []
        subfolder_map[key].append(note)

    # Build groups with sister plant splitting
    groups = []
    for subfolder, subfolder_notes in sorted(subfolder_map.items()):
        # Sort by modification time (oldest first = trunk base)
        subfolder_notes.sort(key=lambda n: n["modifiedAt"] or 0)
        note_ids = [n["id"] for n in subfolder_notes]

        if len(note_ids) <= MAX_NOTES_PER_PLANT:
            # Single plant
            groups.append({
                "name": subfolder,
                "noteIds": note_ids,
                "mode": "subfolder",
                "space": subfolder_notes[0]["space"] if subfolder_notes else "Bridge",
                "sister_index": 0,
                "sister_total": 1,
            })
        else:
            # Sister plant splitting
            num_sisters = math.ceil(len(note_ids) / MAX_NOTES_PER_PLANT)
            chunk_size = math.ceil(len(note_ids) / num_sisters)

            for si in range(num_sisters):
                start = si * chunk_size
                end = min(start + chunk_size, len(note_ids))
                chunk = note_ids[start:end]

                suffix = f" ({si + 1}/{num_sisters})" if num_sisters > 1 else ""
                groups.append({
                    "name": f"{subfolder}{suffix}",
                    "noteIds": chunk,
                    "mode": "subfolder",
                    "space": subfolder_notes[0]["space"] if subfolder_notes else "Bridge",
                    "sister_tag": subfolder,  # links sister plants
                    "sister_index": si,
                    "sister_total": num_sisters,
                })

    # Build edge list for pollen paths (source note id → target note id)
    pollen_edges = []
    for edge in edges:
        src = id_map.get(edge["source"])
        tgt = id_map.get(edge["target"])
        if src is not None and tgt is not None:
            pollen_edges.append({"source": src, "target": tgt, "weight": edge.get("weight", 1)})

    # Stats
    space_counts = {}
    for g in groups:
        s = g["space"]
        space_counts[s] = space_counts.get(s, 0) + 1

    garden_data = {
        "notes": notes,
        "groups": groups,
        "edges": pollen_edges,
        "colors": SPACE_COLORS,
        "stats": {
            "total_notes": len(notes),
            "total_groups": len(groups),
            "total_edges": len(pollen_edges),
            "by_space": space_counts,
            "sister_plants": sum(1 for g in groups if g.get("sister_total", 1) > 1),
        },
    }

    return garden_data


def main():
    # First, run graph_builder if graph_data.json doesn't exist or is stale
    if not GRAPH_DATA.exists():
        print("🔍 graph_data.json not found, running graph_builder.py...")
        builder = WORKSPACE / "Workshop" / "Aesthetics" / "knowledge-graph" / "graph_builder.py"
        if builder.exists():
            os.system(f"python3 {builder}")
        else:
            print("❌ graph_builder.py not found. Run it first.")
            return

    with open(GRAPH_DATA) as f:
        graph = json.load(f)

    print(f"🌱 Transforming {len(graph['nodes'])} nodes into garden data...")
    garden = build_garden_data(graph)

    with open(OUTPUT, "w") as f:
        json.dump(garden, f, indent=1)

    stats = garden["stats"]
    print(f"✅ Garden data: {stats['total_notes']} notes → {stats['total_groups']} plants ({stats['sister_plants']} sister splits)")
    print(f"   Bridge: {stats['by_space'].get('Bridge', 0)} | Lab: {stats['by_space'].get('Lab', 0)} | Workshop: {stats['by_space'].get('Workshop', 0)}")
    print(f"   Pollen edges: {stats['total_edges']}")
    print(f"   → {OUTPUT}")


if __name__ == "__main__":
    main()
