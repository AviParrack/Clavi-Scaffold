#!/usr/bin/env python3
"""
Enhanced save-conversation: produces a single markdown file with
YAML frontmatter metadata + clean readable transcript below.

Format: *Avi:* message / *Claude:* message (lightweight speaker labels)
Output → Library/Conversations/YYYY-MM-DD-topic.md
"""

import argparse
import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path


def slugify(text):
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-+', '-', text)
    return text.strip('-')[:50]


def extract_session_metadata(jsonl_path):
    """Extract high-level metadata from the session log."""
    session_id = None
    first_ts = None
    last_ts = None
    branch = None
    tool_counter = Counter()
    turn_count = 0

    with open(jsonl_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            ts = entry.get('timestamp')
            if ts:
                if first_ts is None:
                    first_ts = ts
                last_ts = ts

            if not session_id:
                session_id = entry.get('sessionId')
            if not branch:
                branch = entry.get('gitBranch')

            if entry.get('type') == 'user':
                turn_count += 1
            if entry.get('type') == 'assistant':
                content = entry.get('message', {}).get('content', [])
                if isinstance(content, list):
                    for item in content:
                        if isinstance(item, dict) and item.get('type') == 'tool_use':
                            tool_counter[item.get('name', 'Unknown')] += 1

    duration = None
    if first_ts and last_ts:
        try:
            t1 = datetime.fromisoformat(first_ts.replace('Z', '+00:00'))
            t2 = datetime.fromisoformat(last_ts.replace('Z', '+00:00'))
            delta = t2 - t1
            hours = delta.total_seconds() / 3600
            if hours >= 1:
                duration = f"~{hours:.1f} hours"
            else:
                duration = f"~{int(delta.total_seconds() / 60)} minutes"
        except (ValueError, AttributeError):
            pass

    return {
        'session_id': session_id,
        'first_ts': first_ts,
        'last_ts': last_ts,
        'branch': branch,
        'turn_count': turn_count,
        'tools_used': sorted(tool_counter.keys()),
        'tool_counts': dict(tool_counter.most_common(15)),
        'duration': duration,
    }


def main():
    parser = argparse.ArgumentParser(description='Save conversation with metadata header')
    parser.add_argument('--session-id', required=True)
    parser.add_argument('--project-path', required=True)
    parser.add_argument('--project-dir', required=True)
    parser.add_argument('--topic', default=None)
    args = parser.parse_args()

    claude_dir = Path.home() / '.claude'
    jsonl_path = claude_dir / 'projects' / args.project_path / f'{args.session_id}.jsonl'
    project_dir = Path(args.project_dir)
    conversations_dir = project_dir / 'Library' / 'Conversations'

    if not jsonl_path.exists():
        print(f'Error: Session log not found: {jsonl_path}', file=sys.stderr)
        sys.exit(1)

    conversations_dir.mkdir(parents=True, exist_ok=True)

    # Import the original export module for transcript parsing
    export_scripts = Path(args.project_dir) / '.claude' / 'skills' / 'save-conversation' / 'scripts'
    sys.path.insert(0, str(export_scripts))

    try:
        from export import parse_conversation
    except ImportError:
        print('Error: could not import export.py from save-conversation skill', file=sys.stderr)
        sys.exit(1)

    meta = extract_session_metadata(jsonl_path)
    turns = parse_conversation(jsonl_path)

    if not turns:
        print('Error: No conversation content found', file=sys.stderr)
        sys.exit(1)

    # Determine topic
    topic = args.topic
    if not topic:
        with open(jsonl_path, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    entry = json.loads(line)
                    if 'slug' in entry:
                        topic = entry['slug']
                        break
                except json.JSONDecodeError:
                    continue
    if not topic:
        topic = 'conversation'

    topic_slug = slugify(topic)

    # Format date
    date_str = 'Unknown'
    if meta['first_ts']:
        try:
            dt = datetime.fromisoformat(meta['first_ts'].replace('Z', '+00:00'))
            date_str = dt.strftime('%Y-%m-%d %H:%M')
        except (ValueError, AttributeError):
            pass

    # Build YAML frontmatter
    tools_list = ', '.join(meta['tools_used']) if meta['tools_used'] else 'none'
    frontmatter = f"""---
session: {meta['session_id'] or args.session_id}
date: {date_str}
topic: {topic}
branch: {meta['branch'] or 'unknown'}
turns: {meta['turn_count']}
duration: {meta['duration'] or 'unknown'}
tools_used: [{tools_list}]
---"""

    # Build transcript with lightweight speaker labels
    transcript_lines = []
    for turn in turns:
        role = turn['role']
        content = turn['content']
        tools = turn.get('tools', [])

        if role == 'user':
            transcript_lines.append(f'*Avi:* {content}')
        else:
            transcript_lines.append(f'*Claude:* {content}')

        if tools:
            tool_names = ', '.join(tools)
            transcript_lines.append(f'> Tools: {tool_names}')

        transcript_lines.append('')

    transcript = '\n'.join(transcript_lines)

    # Combine
    output = f"{frontmatter}\n\n# {topic}\n\n{transcript}"

    # Write
    date_prefix = datetime.now().strftime('%Y-%m-%d')
    output_path = conversations_dir / f'{date_prefix}-{topic_slug}.md'
    counter = 1
    while output_path.exists():
        output_path = conversations_dir / f'{date_prefix}-{topic_slug}-{counter}.md'
        counter += 1

    output_path.write_text(output, encoding='utf-8')
    print(f'Saved: {output_path}')
    print(f'Turns: {len(turns)} | Duration: {meta["duration"] or "unknown"} | Tools: {len(meta["tools_used"])}')


if __name__ == '__main__':
    main()
