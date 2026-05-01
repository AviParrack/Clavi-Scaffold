#!/usr/bin/env python3
"""
Knowledge Graph Builder — Clavi Workspace
Parses all markdown files across Harbor/Town-Hall/Workshop/Library/Embassy/Crossroads, extracts links and
frontmatter, and outputs a structured graph as JSON.
"""

import json
import os
import re
import sys
import time
import yaml
from pathlib import Path
from typing import Optional
from collections import defaultdict

WORKSPACE = Path(__file__).resolve().parents[3]  # repo root
SPACES = ["Harbor", "Town-Hall", "Workshop", "Library", "Embassy", "Crossroads"]

SPACE_COLORS = {
    "Harbor": "#9CA3AF",     # gray
    "Town-Hall": "#3B82F6",  # blue
    "Workshop": "#E87040",   # orange
    "Library": "#0D9488",    # teal/green
    "Embassy": "#A855F7",    # purple
    "Crossroads": "#EF4444", # red
}

CANONICAL_COLOR = "#E87040"  # canonical orange (matches Workshop space color)

# Topic clusters — map top-level subdirs to cluster names
def get_cluster(rel_path: str) -> str:
    parts = rel_path.split("/")
    if len(parts) >= 2:
        return f"{parts[0]}/{parts[1]}"
    return parts[0]


def get_space(rel_path: str) -> str:
    return rel_path.split("/")[0]


def parse_frontmatter(content: str) -> dict:
    """Extract YAML frontmatter if present."""
    if not content.startswith("---"):
        return {}
    end = content.find("---", 3)
    if end == -1:
        return {}
    try:
        return yaml.safe_load(content[3:end]) or {}
    except yaml.YAMLError:
        return {}


def extract_links(content: str) -> list[str]:
    """Extract markdown link targets and wiki links."""
    # Standard markdown links: [text](path)
    md_links = re.findall(r'\[(?:[^\]]*)\]\(([^)]+)\)', content)
    # Wiki links: [[path]]
    wiki_links = re.findall(r'\[\[([^\]]+)\]\]', content)

    targets = []
    for link in md_links + wiki_links:
        # Skip URLs, anchors, images
        if link.startswith(("http://", "https://", "mailto:", "#")):
            continue
        # Strip anchors and query params
        link = link.split("#")[0].split("?")[0]
        if link:
            targets.append(link)
    return targets


def get_first_lines(content: str, n: int = 3) -> str:
    """Get first n non-empty, non-frontmatter lines."""
    lines = content.split("\n")
    # Skip frontmatter
    start = 0
    if lines and lines[0].strip() == "---":
        for i, line in enumerate(lines[1:], 1):
            if line.strip() == "---":
                start = i + 1
                break

    result = []
    for line in lines[start:]:
        stripped = line.strip()
        if stripped:
            result.append(stripped)
            if len(result) >= n:
                break
    return "\n".join(result)


def resolve_link(source_path: Path, target: str) -> Optional[str]:
    """Resolve a relative link target to a workspace-relative path."""
    source_dir = source_path.parent

    # Try as-is
    candidate = (source_dir / target).resolve()
    try:
        rel = candidate.relative_to(WORKSPACE)
        if candidate.exists():
            return str(rel)
    except ValueError:
        pass

    # Try with .md extension
    if not target.endswith(".md"):
        candidate = (source_dir / (target + ".md")).resolve()
        try:
            rel = candidate.relative_to(WORKSPACE)
            if candidate.exists():
                return str(rel)
        except ValueError:
            pass

    # Return resolved path even if file doesn't exist (for dangling link detection)
    candidate = (source_dir / target).resolve()
    try:
        return str(candidate.relative_to(WORKSPACE))
    except ValueError:
        return None


def build_graph():
    nodes = {}  # rel_path -> node dict
    edges = []  # list of {source, target}
    edge_counts = defaultdict(int)  # (source, target) -> count
    edge_types = defaultdict(set)   # (source, target) -> set of 'inline' | 'frontmatter'

    TEXT_EXTS = {'.md', '.py', '.html', '.css', '.js', '.ts', '.json', '.yaml', '.yml',
                 '.toml', '.sh', '.txt', '.r', '.ipynb', '.csv'}
    BINARY_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.svg', '.pdf', '.webp', '.ico',
                   '.docx', '.xlsx', '.zip', '.ttf', '.otf', '.plist'}
    ALL_EXTS = TEXT_EXTS | BINARY_EXTS
    SKIP_DIRS = {'node_modules', '__pycache__', 'venv', '.venv', 'dist', 'build'}

    # Exclude paths — submodule bulk that clutters the graph.
    # Add your own large submodule / generated-asset directories here.
    EXCLUDE_PREFIXES = [
        "Town-Hall/Scaffold/claude-scientific-skills/",
        "Town-Hall/Scaffold/academic-research-skills/",
        "Town-Hall/Scaffold/gstack/",
        "Town-Hall/Scaffold/trailofbits-config/",
        "Town-Hall/User/Web-Presence/",
        "Town-Hall/User/Aesthetics/",
    ]

    for space in SPACES:
        space_dir = WORKSPACE / space
        if not space_dir.exists():
            continue

        for filepath in space_dir.rglob("*"):
            if filepath.is_dir():
                continue
            if filepath.suffix.lower() not in ALL_EXTS:
                continue

            parts = filepath.relative_to(WORKSPACE).parts
            if any(p.startswith(".") or p in SKIP_DIRS for p in parts):
                continue

            rel_path = str(filepath.relative_to(WORKSPACE))

            # Skip excluded prefixes
            if any(rel_path.startswith(prefix) for prefix in EXCLUDE_PREFIXES):
                continue
            ext = filepath.suffix.lower().lstrip('.')
            is_binary = filepath.suffix.lower() in BINARY_EXTS
            space_name = get_space(rel_path)

            if is_binary:
                content = ""
                try:
                    byte_count = filepath.stat().st_size
                except OSError:
                    byte_count = 0
                line_count = 0
                word_count = 0
                char_count = 0
                frontmatter = {}
            else:
                try:
                    content = filepath.read_text(errors="replace")
                except Exception:
                    continue
                byte_count = len(content.encode('utf-8', errors='replace'))
                line_count = content.count("\n") + 1
                word_count = len(content.split())
                char_count = len(content)
                frontmatter = parse_frontmatter(content) if ext == 'md' else {}

            is_canonical = frontmatter.get("canonical", False)
            tier = frontmatter.get("tier", None)

            size = 10
            if is_canonical:
                size = 30
            elif tier in ("S", "A"):
                size = 25
            elif tier in ("B",):
                size = 15

            if is_binary:
                title = f"[{ext.upper()} — {byte_count:,} bytes]"
            else:
                title = get_first_lines(content)

            nodes[rel_path] = {
                "id": rel_path,
                "label": filepath.name,
                "space": space_name,
                "cluster": get_cluster(rel_path),
                "color": CANONICAL_COLOR if is_canonical else SPACE_COLORS.get(space_name, "#888"),
                "size": size,
                "canonical": is_canonical,
                "tier": tier,
                "title": title,
                "last_modified": os.path.getmtime(filepath),
                "in_links": 0,
                "out_links": 0,
                "line_count": line_count,
                "char_count": char_count,
                "word_count": word_count,
                "byte_count": byte_count,
                "extension": ext,
            }

            # Extract links (only from markdown files)
            if ext == 'md':
                inline_targets = extract_links(content)
                related = frontmatter.get("related_projects", [])
                fm_targets = list(related) if isinstance(related, list) else []

                for target in inline_targets:
                    resolved = resolve_link(filepath, target)
                    if resolved and resolved != rel_path:
                        key = (rel_path, resolved)
                        edge_counts[key] += 1
                        edge_types[key].add('inline')

                for target in fm_targets:
                    resolved = resolve_link(filepath, target)
                    if resolved and resolved != rel_path:
                        key = (rel_path, resolved)
                        edge_counts[key] += 1
                        edge_types[key].add('frontmatter')

    # Detect bidirectional links
    bidir_pairs = set()
    all_keys = set(edge_counts.keys())
    for (s, t) in all_keys:
        if (t, s) in all_keys:
            bidir_pairs.add((min(s, t), max(s, t)))

    # Build edges with weight + metadata
    for (source, target), count in edge_counts.items():
        src_space = source.split("/")[0] if "/" in source else ""
        tgt_space = target.split("/")[0] if "/" in target else ""
        is_bidir = (min(source, target), max(source, target)) in bidir_pairs
        types_list = sorted(edge_types.get((source, target), set()))

        edges.append({
            "source": source,
            "target": target,
            "weight": count,
            "cross_space": src_space != tgt_space and src_space != "" and tgt_space != "",
            "bidirectional": is_bidir,
            "link_type": types_list[0] if len(types_list) == 1 else "mixed" if len(types_list) > 1 else "inline",
        })
        if source in nodes:
            nodes[source]["out_links"] += count
        if target in nodes:
            nodes[target]["in_links"] += count

    # Detect orphans (no incoming links)
    orphans = [nid for nid, n in nodes.items() if n["in_links"] == 0 and n["out_links"] == 0]

    graph = {
        "nodes": list(nodes.values()),
        "edges": edges,
        "stats": {
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "orphans": len(orphans),
            "by_space": {
                s: len([n for n in nodes.values() if n["space"] == s])
                for s in SPACES
            },
            "canonical_count": len([n for n in nodes.values() if n["canonical"]]),
        },
        "orphan_files": orphans,
    }

    return graph


def main():
    print("🔍 Scanning workspace...")
    graph = build_graph()

    out_path = Path(__file__).parent / "graph_data.json"
    with open(out_path, "w") as f:
        json.dump(graph, f, indent=2)

    stats = graph["stats"]
    print(f"✅ Graph built: {stats['total_nodes']} nodes, {stats['total_edges']} edges")
    print(f"   Harbor: {stats["by_space"].get("Harbor", 0)} | Town-Hall: {stats["by_space"].get("Town-Hall", 0)} | Workshop: {stats["by_space"].get("Workshop", 0)} | Library: {stats["by_space"].get("Library", 0)}")
    print(f"   Canonical: {stats['canonical_count']} | Orphans: {stats['orphans']}")
    # File type breakdown
    ext_counts = defaultdict(int)
    for n in graph["nodes"]:
        ext_counts[n.get("extension", "md")] += 1
    ext_str = " | ".join(f".{k}: {v}" for k, v in sorted(ext_counts.items(), key=lambda x: -x[1]))
    print(f"   Types: {ext_str}")
    print(f"   → {out_path}")
    return graph


if __name__ == "__main__":
    main()
