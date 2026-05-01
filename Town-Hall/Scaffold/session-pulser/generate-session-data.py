#!/usr/bin/env python3
"""
Generate sessions-data.json from ~/.claude/ session history.
Reconstructed from the CLAUDE.md spec in the Session Pulser dashboard.

Output schema:
{
  notes: [...sessions],
  groupsByProject: [...],
  groupsByTopic: [...],
  stats: { totalSessions, totalPrompts, totalInputTokens, totalOutputTokens, ... }
}
"""

import json
import os
import glob
import re
from pathlib import Path
from collections import defaultdict

CLAUDE_DIR = Path.home() / ".claude"
HISTORY_FILE = CLAUDE_DIR / "history.jsonl"
PROJECTS_DIR = CLAUDE_DIR / "projects"
OUTPUT_FILE = Path(__file__).parent / "sessions-data.json"
NAME_MAP_FILE = Path(__file__).parent / "name_map.json"

# Load optional name map
name_map = {}
if NAME_MAP_FILE.exists():
    try:
        name_map = json.loads(NAME_MAP_FILE.read_text())
    except Exception:
        pass


def project_display_name(project_path):
    """Convert a project path to a display name."""
    if not project_path:
        return "Unknown"

    # Check name map first
    home = str(Path.home())
    rel = project_path.replace(home + "/", "").replace(home, "")
    # Strip common prefixes
    for prefix in ["Documents/", "Dropbox/", "Projects/", "Code/", "dev/"]:
        if rel.startswith(prefix):
            rel = rel[len(prefix):]

    if rel in name_map:
        return name_map[rel]

    # Auto-generate: take last path component, titlecase
    name = Path(rel).name or rel
    # Convert kebab/snake to title
    name = name.replace("-", " ").replace("_", " ")
    return name.title()


def folder_to_project_key(folder_name):
    """Convert a projects/ folder name back to a path.
    Folder names encode / as - with a leading -, e.g.:
    -Users-username-Repo-Name -> /Users/username/Repo-Name
    We reconstruct by checking which path actually exists."""
    # Try the simple approach first: leading dash = /
    candidate = "/" + folder_name.lstrip("-").replace("-", "/")

    # Walk backwards to find the longest existing prefix
    parts = candidate.split("/")
    for i in range(len(parts), 0, -1):
        test = "/".join(parts[:i])
        if test and os.path.isdir(test):
            return test

    return candidate


def extract_text_from_content(content):
    """Extract plain text from message content (handles string or list of blocks)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    texts.append(block.get("text", ""))
                elif block.get("type") == "tool_use":
                    inp = block.get("input", {})
                    if isinstance(inp, dict):
                        # Count content/command as chars
                        for v in inp.values():
                            if isinstance(v, str):
                                texts.append(v)
            elif isinstance(block, str):
                texts.append(block)
        return "\n".join(texts)
    return ""




# Workspace root — used to extract relative paths for topic inference.
# Override via REPO_DIR env var; defaults to current working directory.
WORKSPACE_ROOT = os.environ.get("REPO_DIR", os.getcwd()).rstrip("/") + "/"

# Optional aliases: map historical/renamed folder names to current paths.
# Edit name_map.json (gitignored) to add your own — keys = raw folder name, values = current scaffold path.
TOPIC_ALIASES = {}

# Optional display names for topic paths. Edit name_map.json to override per-folder labels.
TOPIC_DISPLAY = {}

# Map topic paths to categories (for treemap colors)
TOPIC_CATEGORIES = {
    "Bridge": "meta",
    "Lab": "research",
    "Workshop": "building",
}


def infer_topic_from_paths(file_paths):
    """Given a list of workspace-relative file paths, infer the dominant topic."""
    from collections import Counter
    topics = Counter()

    for fp in file_paths:
        # Normalize: strip workspace root if present
        rel = fp
        if WORKSPACE_ROOT and fp.startswith(WORKSPACE_ROOT):
            rel = fp[len(WORKSPACE_ROOT):]

        parts = rel.strip("/").split("/")

        # Build a topic key from the first 1-2 meaningful path components
        if len(parts) >= 2 and parts[0] in ("Bridge", "Lab", "Workshop"):
            topic = f"{parts[0]}/{parts[1]}"
        elif len(parts) >= 1 and parts[0]:
            raw = parts[0]
            # Check aliases for old folder names
            topic = TOPIC_ALIASES.get(raw, raw)
        else:
            continue

        # Resolve aliases
        topic = TOPIC_ALIASES.get(topic, topic)
        topics[topic] += 1

    if topics:
        return topics.most_common(1)[0][0]
    return None


def extract_file_paths_from_messages(messages):
    """Extract all workspace file paths from user and assistant messages."""
    paths = []

    for msg in messages:
        msg_type = msg.get("type", "")

        # User messages: check for ide_opened_file tags
        if msg_type == "user":
            content = msg.get("message", {}).get("content", "")
            if isinstance(content, list):
                for block in content:
                    text = ""
                    if isinstance(block, dict):
                        text = block.get("text", "")
                    elif isinstance(block, str):
                        text = block
                    # Extract ide_opened_file paths
                    pattern = re.escape(WORKSPACE_ROOT) + r'([^<\n\s"]+)'
                    matches = re.findall(pattern, text)
                    paths.extend(matches)
            elif isinstance(content, str):
                pattern = re.escape(WORKSPACE_ROOT) + r'([^<\n\s"]+)'
                matches = re.findall(pattern, content)
                paths.extend(matches)

        # Assistant messages: check tool_use file_path and path args
        elif msg_type == "assistant":
            content = msg.get("message", {}).get("content", [])
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        inp = block.get("input", {})
                        if isinstance(inp, dict):
                            workspace_basename = WORKSPACE_ROOT.rstrip("/").split("/")[-1] + "/"
                            for key in ("file_path", "path", "pattern"):
                                val = inp.get(key, "")
                                if isinstance(val, str) and workspace_basename in val:
                                    rel = val.split(workspace_basename)[-1]
                                    paths.append(rel)
                            # Also check command strings for paths
                            cmd = inp.get("command", "")
                            if isinstance(cmd, str):
                                pattern = re.escape(WORKSPACE_ROOT) + r'([^\s"\']+)'
                                matches = re.findall(pattern, cmd)
                                paths.extend(matches)

    return paths


def parse_session(session_id, jsonl_path, project_path=None):
    """Parse a single session JSONL file into a note dict."""
    messages = []
    try:
        with open(jsonl_path, "r", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    messages.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except Exception:
        return None

    if not messages:
        return None

    # Extract data
    user_prompts = []
    input_tokens = 0
    output_tokens = 0
    chars_added = 0
    chars_removed = 0
    files_touched = set()
    first_timestamp = None
    last_timestamp = None
    model = None
    summary_title = None
    prompt_count = 0
    cwd = project_path

    for msg in messages:
        msg_type = msg.get("type", "")
        ts_raw = msg.get("timestamp")

        # Parse timestamp
        ts = None
        if ts_raw:
            if isinstance(ts_raw, (int, float)):
                ts = ts_raw
            elif isinstance(ts_raw, str):
                try:
                    from datetime import datetime, timezone
                    dt = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
                    ts = dt.timestamp() * 1000  # ms
                except Exception:
                    pass

        if ts:
            if first_timestamp is None or ts < first_timestamp:
                first_timestamp = ts
            if last_timestamp is None or ts > last_timestamp:
                last_timestamp = ts

        if msg_type == "user":
            content = msg.get("message", {}).get("content", "")
            text = extract_text_from_content(content)
            if text.strip():
                user_prompts.append(text.strip()[:200])  # cap length
                prompt_count += 1
            if not cwd and msg.get("cwd"):
                cwd = msg["cwd"]

        elif msg_type == "assistant":
            message = msg.get("message", {})
            usage = message.get("usage", {})
            input_tokens += usage.get("input_tokens", 0)
            input_tokens += usage.get("cache_creation_input_tokens", 0)
            input_tokens += usage.get("cache_read_input_tokens", 0)
            output_tokens += usage.get("output_tokens", 0)

            if not model and message.get("model"):
                model = message["model"]

            # Estimate chars from assistant content (tool_use inputs = chars added)
            content = message.get("content", [])
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict):
                        if block.get("type") == "tool_use":
                            tool_name = block.get("name", "")
                            inp = block.get("input", {})
                            if tool_name in ("Write", "Edit", "NotebookEdit"):
                                # Chars added from write/edit operations
                                for key in ("content", "new_string", "new_source"):
                                    val = inp.get(key, "")
                                    if isinstance(val, str):
                                        chars_added += len(val)
                                # Chars removed from edit old_string
                                old = inp.get("old_string", "")
                                if isinstance(old, str):
                                    chars_removed += len(old)
                                # Track file
                                fp = inp.get("file_path", "")
                                if fp:
                                    files_touched.add(fp)

        elif msg_type == "file-history-snapshot":
            snap = msg.get("snapshot", {})
            backups = snap.get("trackedFileBackups", {})
            files_touched.update(backups.keys())

        elif msg_type == "summary":
            summary_title = msg.get("summary", "")

    if not user_prompts and not summary_title:
        return None

    # --- Topic inference from file paths ---
    all_paths = extract_file_paths_from_messages(messages)
    inferred_topic = infer_topic_from_paths(all_paths)

    # Determine display name
    if inferred_topic:
        subfolder = TOPIC_DISPLAY.get(inferred_topic, inferred_topic.replace("/", " › "))
        topic_key = inferred_topic
    else:
        # Fall back to prompt-based heuristic
        first_text = (user_prompts[0] if user_prompts else "").lower()
        if any(w in first_text for w in ["email", "gmail", "send"]):
            subfolder = "Email & Comms"
            topic_key = "comms"
        elif any(w in first_text for w in ["telegram", "message", "chat"]):
            subfolder = "Email & Comms"
            topic_key = "comms"
        elif any(w in first_text for w in ["calendar", "schedule", "meeting"]):
            subfolder = "Calendar & Scheduling"
            topic_key = "calendar"
        elif summary_title:
            subfolder = summary_title[:40]
            topic_key = "misc"
        else:
            subfolder = project_display_name(cwd)
            topic_key = "misc"

    # Build prompt samples (first 3 + last 3)
    if len(user_prompts) <= 6:
        prompt_samples = user_prompts
    else:
        prompt_samples = user_prompts[:3] + user_prompts[-3:]

    first_prompt = user_prompts[0] if user_prompts else (summary_title or "")
    last_prompt = user_prompts[-1] if len(user_prompts) > 1 else ""

    return {
        "id": session_id,
        "sessionId": session_id,
        "name": first_prompt[:150],
        "lastPrompt": last_prompt[:150],
        "promptSamples": [p[:150] for p in prompt_samples],
        "subfolder": subfolder,
        "topicKey": topic_key,
        "projectPath": cwd,
        "charsAdded": chars_added,
        "charsRemoved": chars_removed,
        "filesTouched": len(files_touched),
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "promptCount": prompt_count,
        "firstTimestamp": first_timestamp,
        "lastTimestamp": last_timestamp,
        "model": model or "unknown",
        "tags": [],
        "sessionType": "conversation",
        "text_preview": summary_title or first_prompt[:100],
    }


def categorize_project(name, topic_key=None):
    """Categorize by workspace space or content heuristic."""
    if topic_key:
        if topic_key.startswith("Bridge"):
            return "meta"
        if topic_key.startswith("Lab"):
            return "research"
        if topic_key.startswith("Workshop"):
            return "building"

    lower = name.lower()
    if any(w in lower for w in ["blog", "write", "draft", "post", "essay", "twitter"]):
        return "building"
    if any(w in lower for w in ["web", "site", "app", "ui", "dashboard", "aesthetic"]):
        return "building"
    if any(w in lower for w in ["research", "lab", "paper", "study", "space", "compute", "govern"]):
        return "research"
    if any(w in lower for w in ["config", "setup", "scaffold", "tool", "meta", "claude"]):
        return "meta"
    if any(w in lower for w in ["email", "comms", "calendar", "meeting"]):
        return "comms"
    return "general"


def main():
    print("Scanning ~/.claude/ for session data...")

    # Read history.jsonl for session index
    history_entries = {}
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE, "r", errors="replace") as f:
            for line in f:
                try:
                    entry = json.loads(line.strip())
                    sid = entry.get("sessionId")
                    if sid:
                        history_entries[sid] = entry
                except Exception:
                    continue

    print(f"  Found {len(history_entries)} history entries")

    # Find all session JSONL files across all projects
    all_sessions = []
    seen_ids = set()

    if PROJECTS_DIR.exists():
        for project_dir in sorted(PROJECTS_DIR.iterdir()):
            if not project_dir.is_dir():
                continue

            project_path = folder_to_project_key(project_dir.name)

            for jsonl_file in sorted(project_dir.glob("*.jsonl")):
                session_id = jsonl_file.stem
                if session_id in seen_ids:
                    continue
                seen_ids.add(session_id)

                # Use history entry's project path if available (more reliable)
                hist = history_entries.get(session_id, {})
                known_path = hist.get("project") or None

                note = parse_session(session_id, jsonl_file, known_path)
                if note:
                    if not note["firstTimestamp"] and hist.get("timestamp"):
                        note["firstTimestamp"] = hist["timestamp"]

                    all_sessions.append(note)

    # Sort by most recent
    all_sessions.sort(key=lambda n: n.get("lastTimestamp") or 0, reverse=True)

    print(f"  Parsed {len(all_sessions)} sessions")

    # Build project groups
    projects = defaultdict(lambda: {
        "sessionCount": 0,
        "totalInputTokens": 0,
        "totalOutputTokens": 0,
        "totalCharsAdded": 0,
        "totalCharsRemoved": 0,
        "totalFilesTouched": 0,
        "totalPrompts": 0,
        "firstTimestamp": None,
        "lastTimestamp": None,
        "sessions": [],
    })

    for note in all_sessions:
        key = note["subfolder"]
        p = projects[key]
        p["sessionCount"] += 1
        p["totalInputTokens"] += note["inputTokens"]
        p["totalOutputTokens"] += note["outputTokens"]
        p["totalCharsAdded"] += note["charsAdded"]
        p["totalCharsRemoved"] += note["charsRemoved"]
        p["totalFilesTouched"] += note["filesTouched"]
        p["totalPrompts"] += note["promptCount"]
        p["sessions"].append(note["sessionId"])
        if not p.get("topicKey"):
            p["topicKey"] = note.get("topicKey")

        ts = note.get("firstTimestamp")
        if ts:
            if p["firstTimestamp"] is None or ts < p["firstTimestamp"]:
                p["firstTimestamp"] = ts
        ts = note.get("lastTimestamp")
        if ts:
            if p["lastTimestamp"] is None or ts > p["lastTimestamp"]:
                p["lastTimestamp"] = ts

    groups_by_project = []
    for name, data in sorted(projects.items(), key=lambda x: x[1]["totalInputTokens"] + x[1]["totalOutputTokens"], reverse=True):
        # Dashboard expects flat top-level fields on each project group
        groups_by_project.append({
            "name": name,
            "category": categorize_project(name, data.get("topicKey")),
            "totalInputTokens": data["totalInputTokens"],
            "totalOutputTokens": data["totalOutputTokens"],
            "totalCharsAdded": data["totalCharsAdded"],
            "totalCharsRemoved": data["totalCharsRemoved"],
            "totalFilesTouched": data["totalFilesTouched"],
            "totalPrompts": data["totalPrompts"],
            "sessionCount": data["sessionCount"],
            "firstTimestamp": data["firstTimestamp"],
            "lastTimestamp": data["lastTimestamp"],
            "noteIds": data["sessions"],  # sparklines need this
        })

    # Compute date range
    all_timestamps = [n["firstTimestamp"] for n in all_sessions if n.get("firstTimestamp")]
    date_first = min(all_timestamps) if all_timestamps else 0
    date_last = max(all_timestamps) if all_timestamps else 0

    # Global stats
    stats = {
        "totalSessions": len(all_sessions),
        "totalPrompts": sum(n["promptCount"] for n in all_sessions),
        "totalInputTokens": sum(n["inputTokens"] for n in all_sessions),
        "totalOutputTokens": sum(n["outputTokens"] for n in all_sessions),
        "totalCharsAdded": sum(n["charsAdded"] for n in all_sessions),
        "totalCharsRemoved": sum(n["charsRemoved"] for n in all_sessions),
        "totalFilesTouched": sum(n["filesTouched"] for n in all_sessions),
        "projectCount": len(projects),
        "dateRange": {
            "first": date_first,
            "last": date_last,
        },
    }

    output = {
        "notes": all_sessions,
        "groupsByProject": groups_by_project,
        "groupsByTopic": [],  # Could be enriched with LLM later
        "stats": stats,
    }

    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=1)

    print(f"\n✅ Generated {OUTPUT_FILE}")
    print(f"   {stats['totalSessions']} sessions across {stats['projectCount']} projects")
    print(f"   {stats['totalPrompts']:,} prompts | {stats['totalInputTokens']:,} input tokens | {stats['totalOutputTokens']:,} output tokens")
    print(f"   +{stats['totalCharsAdded']:,} / -{stats['totalCharsRemoved']:,} chars | {stats['totalFilesTouched']:,} files touched")


if __name__ == "__main__":
    main()
