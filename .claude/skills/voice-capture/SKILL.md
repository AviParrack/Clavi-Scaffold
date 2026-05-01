---
name: voice-capture
description: "Process voice memos into transcripts, extract todos, and route to Harbor/Inbox. Use when the user says 'process voice memos', 'transcribe my recordings', 'check for voice notes', or '/voice-capture'. Also runs as a cron automation."
argument-hint: "[audio file or folder path] [--watch]"
metadata:
  author: Avi Parrack & Claude
  version: 0.1.0
---

# Voice Capture

Process voice memos from iPhone (via iCloud sync) or local recordings. Transcribe, extract actionable items, and route to Harbor/Inbox.

**The workflow:** Record a voice memo on your phone → it syncs via iCloud → this skill transcribes it → extracts todos and notes → deposits in Harbor/Inbox/ → ready for triage.

## Audio Sources (in priority order)

### 1. Telegram voice messages (zero friction — primary method)
When a Telegram message arrives with an `attachment_file_id` that's audio:
1. Download via `mcp__plugin_telegram_telegram__download_attachment`
2. Transcribe the downloaded file
3. Process through the extraction pipeline
4. Reply on Telegram with a summary of extracted items

This is the dream: hold mic button in Telegram → talk → release → done.

### 2. Manual drop zone
```
Harbor/Inbox/audio/
```
Drag any audio file here. The skill scans this folder for unprocessed files.

### 3. iCloud Voice Memos (if available)
Modern macOS streams Voice Memos from CloudKit on demand — no local files.
Workaround: create an iPhone Shortcut automation that saves new Voice Memos
to `iCloud Drive/Voice-Drops/`, which syncs to Mac. Or just use Telegram.

## Workflow

### Step 1: Find new audio files

Scan all source locations for `.m4a`, `.mp3`, `.wav`, `.ogg` files. Track which files have already been processed using a log at `Harbor/Dispatch/log/voice-capture-processed.txt` (one filename per line). Skip already-processed files.

### Step 2: Transcribe

For each new audio file, use the `/transcribe-audio` skill (Parakeet MLX, local, fast):

```bash
# The transcribe-audio skill handles this — invoke it on each file
```

If `/transcribe-audio` is not available, fall back to:
```bash
# whisper.cpp fallback
whisper-cpp --model base.en --file "path/to/audio.m4a" --output-txt
```

### Step 3: Analyze transcript

Read the transcript and extract:

1. **Todo items** — anything that sounds like a task, commitment, or action item
   - "I need to..." / "Remind me to..." / "Don't forget to..."
   - "Note to Claude: ..." (explicit notes directed at Claude)
   - "Add to the todo list: ..."

2. **Ideas** — anything that sounds like a project idea, research question, or creative thought
   - "What if we..." / "I wonder whether..." / "It would be cool to..."

3. **Feedback** — anything directed at Claude's behavior
   - "Claude should..." / "Next time Claude should..." / "Feedback: ..."

4. **Raw transcript** — the full unprocessed text for reference

### Step 4: Route

Create a markdown file in Harbor/Inbox/:

```markdown
---
source: voice-capture
date: YYYY-MM-DD
audio_file: [original filename]
duration: [if available]
status: pending
---

# Voice Memo — YYYY-MM-DD HH:MM

## Extracted Items

### Todos
- [ ] [extracted todo 1]
- [ ] [extracted todo 2]

### Ideas
- [extracted idea]

### Feedback
- [extracted feedback]

## Full Transcript

[complete transcript text]
```

**File naming:** `Harbor/Inbox/voice-memo-YYYY-MM-DD-HHMMSS.md`

### Step 5: Route special items

- **Todos** → also append to `Harbor/todo.md` with source reference
- **Feedback** → also append to `Library/Logs/feedback-log.md`
- **Notes to Claude** → also save as auto-memory entries if substantive

### Step 6: Log and clean up

- Add the processed filename to `Harbor/Dispatch/log/voice-capture-processed.txt`
- Do NOT delete the original audio file (it stays in Voice Memos / source folder)
- Git add and commit the new inbox item

## Automation

**As a cron (Mac Mini):** Run every 30 minutes or hourly to catch new voice memos:

```
Cron: */30 * * * *
Prompt: "Run /voice-capture to process any new voice memos. Transcribe, extract todos, route to Harbor/Inbox/."
```

**Manual:** Invoke `/voice-capture` anytime to process pending audio.

**On demand for a specific file:** `/voice-capture path/to/recording.m4a`

## Parameters

| Param | Default | Description |
|---|---|---|
| `[path]` | Scan all source locations | Specific audio file or folder |

## Notes

- Transcription is fully local via Parakeet MLX on Apple Silicon — no cloud, no API cost.
- The "Note to Claude" pattern is powerful — you can literally talk to Claude while walking and the message gets delivered next time the system processes.
- Voice memos from iPhone sync via iCloud with some delay (usually minutes). The cron catches them on the next pass.
- For the shower: record via phone in JOTO waterproof pouch. The memo syncs to iCloud, this skill catches it, your shower thought becomes an inbox item.
