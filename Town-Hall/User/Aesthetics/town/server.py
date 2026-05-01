#!/usr/bin/env python3
"""Tiny HTTP server for the town demo.

Serves index.html + a /api/ls and /api/read endpoint for the in-game library.
Paths are resolved relative to ROOT (the Avi-Claude workspace) and
traversal above ROOT is rejected.
"""
from __future__ import annotations

import http.server
import json
import os
import re
import shutil
import subprocess
import sys
from urllib.parse import urlparse, parse_qs, unquote

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
_seen_sessions: set[str] = set()

PORT = 8766
ROOT = os.path.expanduser("~/Avi-Claude")
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))

SKIP_DIRS = {".git", "node_modules", "__pycache__", ".DS_Store", ".venv", "dist", "build"}
READABLE_EXT = {".md", ".txt", ".py", ".js", ".ts", ".tsx", ".jsx", ".html", ".css",
                ".json", ".yaml", ".yml", ".toml", ".sh", ".log", ".csv", ".go",
                ".rs", ".rb", ".java", ".c", ".cpp", ".h", ".hpp", ".svg"}
MAX_READ_BYTES = 256 * 1024

CLAUDE_BIN = shutil.which("claude") or "/opt/homebrew/bin/claude"
CLAUDE_TIMEOUT = 90

PERSONAS = {
    "mayor": (
        "You are Mayor Claude, civic leader of Claude Town. Warm, a little "
        "idealistic, thinks in long arcs about what the town will become. "
        "You run council meetings at the Town Hall podium. Reply in ≤2 short "
        "sentences. No preamble, no emoji, no roleplay asterisks — just speak."
    ),
    "dockhand": (
        "You are Harbor Claude, a weather-worn dockworker at Claude Town's "
        "harbor. Gruff, practical, fond of sea metaphors, suspicious of strange "
        "cargo washing ashore. Reply in ≤2 short sentences. No preamble, no "
        "emoji, no roleplay asterisks."
    ),
    "smith": (
        "You are Smith Claude, the town blacksmith at the forge. Direct, fond "
        "of metaphors about forging and temper, believes every tool protects a "
        "future. Reply in ≤2 short sentences. No preamble, no emoji, no "
        "roleplay asterisks."
    ),
    "archivist": (
        "You are Archivist Claude, keeper of Claude Town's library. Scholarly, "
        "careful, loves files, indexes, and found knowledge. Reply in ≤2 short "
        "sentences. No preamble, no emoji, no roleplay asterisks."
    ),
    "wanderer": (
        "You are Wanderer Claude, new to the town, still figuring out where you "
        "belong. Curious, reflective, philosophical. Reply in ≤2 short "
        "sentences. No preamble, no emoji, no roleplay asterisks."
    ),
    "citizen": (
        "You are a Claude citizen of Claude Town, going about your day. "
        "Friendly, a bit quirky, happy to chat. Reply in ≤2 short sentences. "
        "No preamble, no emoji, no roleplay asterisks."
    ),
    "fisher": (
        "You are Fisher Claude, mending nets at the harbor. Patient, lyrical, "
        "full of stories about what the sea brings back. Reply in ≤2 short "
        "sentences. No preamble, no emoji, no roleplay asterisks."
    ),
    "captain": (
        "You are Captain Claude, pilot of the town's trading boat. Bold, "
        "cheerful, itching to sail. Reply in ≤2 short sentences. No preamble, "
        "no emoji, no roleplay asterisks."
    ),
    "tinker": (
        "You are Tinker Claude, the workshop inventor at the workbench. "
        "Excitable about small gadgets, thinks everything can be iterated. "
        "Reply in ≤2 short sentences. No preamble, no emoji, no roleplay "
        "asterisks."
    ),
    "reader": (
        "You are a Reader Claude in the library, deep in some volume. Quiet, "
        "thoughtful, shares what the page just taught you. Reply in ≤2 short "
        "sentences. No preamble, no emoji, no roleplay asterisks."
    ),
}


def call_claude(role: str, message: str, session_id: str) -> str:
    persona = PERSONAS.get(role, PERSONAS["wanderer"])
    is_new = session_id not in _seen_sessions
    session_flag = ["--session-id", session_id] if is_new else ["--resume", session_id]

    try:
        proc = subprocess.run(
            [CLAUDE_BIN, *session_flag, "-p", "--model", "haiku",
             "--append-system-prompt", persona, message],
            capture_output=True, text=True, timeout=CLAUDE_TIMEOUT,
        )
        reply = (proc.stdout or "").strip()
        if proc.returncode == 0:
            _seen_sessions.add(session_id)
        if not reply:
            err = (proc.stderr or "").strip()
            return f"(…no reply from the model: {err[:160]})" if err else "(…silent.)"
        return reply
    except subprocess.TimeoutExpired:
        return "(…too busy right now. Try again.)"
    except FileNotFoundError:
        return "(claude CLI not found on this machine.)"
    except Exception as e:  # noqa: BLE001
        return f"(error: {e})"


def open_terminal_for_session(session_id: str) -> tuple[bool, str]:
    if not UUID_RE.match(session_id):
        return False, "invalid session id"
    if session_id not in _seen_sessions:
        return False, "session not found"
    # Sessions are per-cwd — must cd to STATIC_DIR (where the server created
    # them) so --resume can find them. --add-dir ROOT grants tool access to
    # the full workspace. --fork-session isolates from further in-game chat.
    cmd = (f"cd {STATIC_DIR} && claude --resume {session_id} "
           f"--fork-session --add-dir {ROOT}")
    # New tab in the current iTerm window (new window only if none exist).
    # Activate + System Events frontmost to beat macOS focus-stealing prevention.
    script = (
        'tell application "iTerm"\n'
        '    activate\n'
        '    if (count of windows) = 0 then\n'
        '        create window with default profile\n'
        '    else\n'
        '        tell current window to create tab with default profile\n'
        '    end if\n'
        '    tell current session of current window\n'
        f'        write text "{cmd}"\n'
        '    end tell\n'
        'end tell\n'
        'tell application "System Events"\n'
        '    try\n'
        '        set frontmost of (first process whose name is "iTerm2") to true\n'
        '    end try\n'
        'end tell\n'
    )
    try:
        subprocess.run(
            ["osascript", "-"], input=script, text=True,
            capture_output=True, timeout=10, check=True,
        )
        return True, "opened"
    except subprocess.CalledProcessError as e:
        return False, f"osascript failed: {(e.stderr or '').strip()[:200]}"
    except FileNotFoundError:
        return False, "osascript not found (not on macOS?)"
    except subprocess.TimeoutExpired:
        return False, "osascript timed out"


def safe_path(rel: str) -> str | None:
    rel = unquote(rel).lstrip("/")
    full = os.path.normpath(os.path.join(ROOT, rel))
    if not full.startswith(ROOT):
        return None
    return full


class Handler(http.server.SimpleHTTPRequestHandler):
    def _send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/ls":
            q = parse_qs(parsed.query)
            rel = q.get("path", [""])[0]
            full = safe_path(rel)
            if not full or not os.path.isdir(full):
                return self._send_json({"error": "not found"}, 404)
            try:
                entries = []
                for name in sorted(os.listdir(full)):
                    if name.startswith(".") and name not in (".claude",):
                        continue
                    if name in SKIP_DIRS:
                        continue
                    p = os.path.join(full, name)
                    is_dir = os.path.isdir(p)
                    try:
                        size = os.path.getsize(p) if not is_dir else 0
                        mtime = os.path.getmtime(p)
                    except OSError:
                        size, mtime = 0, 0
                    entries.append({
                        "name": name,
                        "dir": is_dir,
                        "size": size,
                        "mtime": mtime,
                    })
                return self._send_json({"path": rel, "entries": entries})
            except OSError as e:
                return self._send_json({"error": str(e)}, 500)

        if parsed.path == "/api/read":
            q = parse_qs(parsed.query)
            rel = q.get("path", [""])[0]
            full = safe_path(rel)
            if not full or not os.path.isfile(full):
                return self._send_json({"error": "not found"}, 404)
            ext = os.path.splitext(full)[1].lower()
            if ext not in READABLE_EXT:
                return self._send_json({"error": "unsupported type", "ext": ext}, 415)
            try:
                size = os.path.getsize(full)
                with open(full, "rb") as f:
                    raw = f.read(MAX_READ_BYTES)
                truncated = size > MAX_READ_BYTES
                try:
                    text = raw.decode("utf-8")
                except UnicodeDecodeError:
                    text = raw.decode("utf-8", errors="replace")
                return self._send_json({
                    "path": rel,
                    "size": size,
                    "truncated": truncated,
                    "content": text,
                })
            except OSError as e:
                return self._send_json({"error": str(e)}, 500)

        # Fallback: serve static files from STATIC_DIR
        if parsed.path in ("", "/"):
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/chat":
            length = int(self.headers.get("Content-Length", "0") or 0)
            if length <= 0 or length > 64 * 1024:
                return self._send_json({"error": "bad body length"}, 400)
            try:
                data = json.loads(self.rfile.read(length))
            except json.JSONDecodeError as e:
                return self._send_json({"error": f"bad JSON: {e}"}, 400)
            role = (data.get("role") or "wanderer").strip()
            message = (data.get("message") or "").strip()
            session_id = (data.get("session_id") or "").strip().lower()
            if not message:
                return self._send_json({"error": "empty message"}, 400)
            if len(message) > 4000:
                return self._send_json({"error": "message too long"}, 400)
            if not UUID_RE.match(session_id):
                return self._send_json({"error": "invalid session id"}, 400)
            reply = call_claude(role, message, session_id)
            return self._send_json({"reply": reply, "session_id": session_id})

        if parsed.path == "/api/open-terminal":
            length = int(self.headers.get("Content-Length", "0") or 0)
            if length <= 0 or length > 4 * 1024:
                return self._send_json({"error": "bad body length"}, 400)
            try:
                data = json.loads(self.rfile.read(length))
            except json.JSONDecodeError as e:
                return self._send_json({"error": f"bad JSON: {e}"}, 400)
            session_id = (data.get("session_id") or "").strip().lower()
            ok, detail = open_terminal_for_session(session_id)
            if ok:
                return self._send_json({"ok": True})
            return self._send_json({"error": detail}, 400)

        return self._send_json({"error": "not found"}, 404)

    def translate_path(self, path):
        # Route static files from STATIC_DIR (the town folder).
        # Must unquote — asset filenames contain spaces (%20).
        rel = unquote(urlparse(path).path).lstrip("/")
        full = os.path.normpath(os.path.join(STATIC_DIR, rel))
        # prevent traversal above STATIC_DIR
        if not full.startswith(STATIC_DIR):
            return STATIC_DIR
        return full

    def log_message(self, fmt, *args):
        if "--quiet" in sys.argv:
            return
        sys.stderr.write("[town] %s - %s\n" % (self.address_string(), fmt % args))


def _bootstrap_seen_sessions():
    # Claude CLI stores sessions at ~/.claude/projects/<encoded-cwd>/<uuid>.jsonl.
    # Encoded cwd = path with slashes replaced by hyphens.
    encoded = STATIC_DIR.replace("/", "-")
    project_dir = os.path.expanduser(f"~/.claude/projects/{encoded}")
    if not os.path.isdir(project_dir):
        return 0
    count = 0
    for name in os.listdir(project_dir):
        if name.endswith(".jsonl"):
            sid = name[:-len(".jsonl")]
            if UUID_RE.match(sid):
                _seen_sessions.add(sid)
                count += 1
    return count


def main():
    os.chdir(STATIC_DIR)
    n = _bootstrap_seen_sessions()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[town] serving {STATIC_DIR}")
    print(f"[town] library root: {ROOT}")
    print(f"[town] loaded {n} existing session(s)")
    print(f"[town] http://localhost:{PORT}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[town] stopping")


if __name__ == "__main__":
    main()
