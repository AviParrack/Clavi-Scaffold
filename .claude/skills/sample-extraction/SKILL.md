---
name: sample-extraction
description: "Extract audio samples, sound bites, and lo-fi clips from YouTube videos or local audio files. Use when the user says 'find samples', 'extract clips', 'sound bites', 'sample this', 'lo-fi samples', or '/sample-extraction'. Takes a YouTube URL or audio file, transcribes it, identifies interesting moments, and exports individual audio clips ready for Suno, a DAW, or lo-fi production."
argument-hint: "[youtube-url or audio-file] [--vibe 'lo-fi spoken word' | 'philosophical one-liner' | 'atmospheric' | 'all']"
metadata:
  author: the user & Claude
  version: 0.1.0
---

# Sample Extraction

Turn YouTube videos and audio files into production-ready samples. The AI listens (via transcript), identifies the moments worth sampling, and clips them as individual audio files.

## Pipeline

```
Input (YouTube URL or local audio)
  → /youtube-transcribe (timestamped transcript)
  → Claude reads transcript, identifies candidate moments
  → User reviews + selects
  → ffmpeg clips audio at exact timestamps
  → Output: individual .wav/.mp3 files in Workshop/Songs/samples/
```

## Usage

### From a YouTube video
```
/sample-extraction https://youtube.com/watch?v=... --vibe "lo-fi spoken word"
```

### From a local audio file
```
/sample-extraction path/to/lecture.mp3 --vibe "philosophical one-liner"
```

## Vibe Categories

| Vibe | What to look for |
|---|---|
| `lo-fi spoken word` | Contemplative, slow, atmospheric moments. Good for layering over beats. |
| `philosophical one-liner` | Crisp standalone quotes. Hit hard in isolation. |
| `atmospheric` | Background texture — crowd noise, nature, room tone, ambient moments. |
| `emotional peak` | Genuine feeling — laughter, awe, conviction, vulnerability. |
| `all` | Best moments across all categories. |

If no vibe is specified, default to `all`.

## Workflow

### Step 1: Get timestamped transcript + audio

**If input is a YouTube URL:**

Use yt-dlp to download the audio:
```bash
yt-dlp -x --audio-format mp3 --audio-quality 0 -o "%(title)s.%(ext)s" "URL"
```

Then invoke `/youtube-transcribe` or `/transcribe-audio` on the downloaded file to get a timestamped transcript. If the skill is unavailable, check if there's a `.srt` or `.txt` transcript already generated alongside the audio.

**If input is a local audio file:**

Invoke `/transcribe-audio` on it directly. If that skill is unavailable, ask the user to provide a transcript or timestamps.

### Step 2: Identify candidate moments

Read the full transcript carefully. For each vibe category requested, identify **5-15 candidate moments**. For each candidate:

| # | Vibe | Start | End | Content (what's said/happening) | Why it's good | Suggested name |
|---|---|---|---|---|---|---|
| 1 | lo-fi spoken word | 04:23.5 | 04:31.0 | "The universe is under no obligation to make sense to you" | Clean delivery, contemplative pause after | universe-no-obligation |
| 2 | atmospheric | 12:07.0 | 12:22.0 | [audience laughter + settling] | Warm room tone, natural fade | warm-audience-settle |

**Selection criteria:**
- Clean audio (minimal background noise for spoken word, *good* background noise for atmospheric)
- Natural start and end points (pauses, breaths, sentence boundaries)
- Standalone impact (does it work without context?)
- Rhythmic potential (does the cadence lend itself to music?)
- For lo-fi: slower delivery, lower register, contemplative tone
- For one-liners: punchy, quotable, under 10 seconds

Present the table to the user for review.

### Step 3: User selection

Ask which clips to extract:
- `all` — extract everything
- `1, 3, 7, 12` — specific numbers
- `skip` — abort
- `more` — find additional candidates

### Step 4: Extract clips with ffmpeg

For each selected moment:

**Standard clip (copy, no re-encoding — fastest):**
```bash
ffmpeg -i source_audio.mp3 -ss HH:MM:SS.ms -to HH:MM:SS.ms -c copy "output_name.mp3"
```

**With fade in/out (recommended for samples that will be layered):**
```bash
DURATION=$(echo "END - START" | bc)
ffmpeg -i source_audio.mp3 -ss START -to END -af "afade=t=in:d=0.15,afade=t=out:st=$(echo "$DURATION - 0.3" | bc):d=0.3" "output_name.wav"
```

**WAV for DAW import (maximum quality):**
```bash
ffmpeg -i source_audio.mp3 -ss START -to END -acodec pcm_s16le -ar 44100 "output_name.wav"
```

Default to WAV with fade for production-ready output. Offer MP3 if the user wants smaller files.

### Step 5: Output

Create a dated subfolder in the active project or default to Workshop/Songs/samples/:

```
Workshop/Songs/samples/
  YYYY-MM-DD-source-title/
    01-universe-no-obligation.wav
    02-warm-audience-settle.wav
    03-the-future-is-unwritten.wav
    extraction-log.md
```

### The extraction log

Every batch gets an `extraction-log.md` preserving provenance:

```markdown
# Sample Extraction: [Source Title]

**Source:** [YouTube URL or file path]
**Date:** YYYY-MM-DD
**Vibe filter:** [what was requested]

## Extracted Clips

| # | File | Vibe | Timestamp | Content | Duration |
|---|---|---|---|---|---|
| 1 | 01-universe-no-obligation.wav | lo-fi spoken word | 04:23-04:31 | "The universe is under no obligation..." | 7.5s |

## Candidates Not Selected

| # | Timestamp | Content | Why skipped |
|---|---|---|---|
| 4 | 08:15-08:22 | "We're all just..." | Too noisy |

## Full Transcript Reference

[Link to transcript file if available]
```

## Requirements

- `ffmpeg` (`brew install ffmpeg`)
- `yt-dlp` (`brew install yt-dlp`) — for YouTube sources
- `/youtube-transcribe` or `/transcribe-audio` skill — for timestamped transcripts
- Apple Silicon Mac recommended for local transcription (Parakeet MLX)

## Notes

- All processing is local. No API costs for transcription or clipping.
- For longer samples (>30s), ask whether the user wants the full segment or just the peak moment.
- WAV output for maximum quality in DAW/Suno import. MP3 for sharing/preview.
- The extraction log makes it easy to trace where any sample came from — important for attribution and re-extraction.
- When in doubt about timestamps, pad by 0.5s on each side. Better to clip slightly wide than cut off a word.
