#!/usr/bin/env python3
"""
Knowledge Graph Renderer v2 — Clavi Workspace
Reads graph_data.json and injects it into graph_template.html to produce
a self-contained interactive visualization.
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
GRAPH_DATA = HERE / "graph_data.json"
TEMPLATE = HERE / "graph_template.html"
OUTPUT = HERE / "knowledge-graph.html"


def main():
    if not GRAPH_DATA.exists():
        print("❌ graph_data.json not found. Run graph_builder.py first.")
        sys.exit(1)

    if not TEMPLATE.exists():
        print("❌ graph_template.html not found.")
        sys.exit(1)

    data = json.loads(GRAPH_DATA.read_text())
    template = TEMPLATE.read_text()

    # Inject graph data into template
    html = template.replace('%%GRAPH_DATA%%', json.dumps(data))

    OUTPUT.write_text(html)

    stats = data.get("stats", {})
    print(f"✅ Rendered → {OUTPUT}")
    print(f"   {stats.get('total_nodes', '?')} nodes, {stats.get('total_edges', '?')} edges")
    print(f"   Open: file://{OUTPUT.resolve()}")


if __name__ == "__main__":
    main()
