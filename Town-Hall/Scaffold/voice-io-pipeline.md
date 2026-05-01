# Voice I/O Pipeline

*Goal: full voice loop — speak anywhere → Whisper transcribes → Claude processes → TTS responds via headset.*
*Status: planned, not yet implemented. Hardware recommendations researched.*

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     VOICE I/O LOOP                        │
│                                                          │
│  INPUT (mic → Whisper → text)                            │
│                                                          │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ AT DESK  │  │  ON THE GO   │  │   SHOWER     │       │
│  │          │  │              │  │              │       │
│  │ super-   │  │ throat mic   │  │ phone in     │       │
│  │ whisper  │  │ + iPhone     │  │ waterproof   │       │
│  │ types    │  │ Voice Memo   │  │ pouch        │       │
│  │ into     │  │ → iCloud     │  │ → Voice Memo │       │
│  │ Claude   │  │ → batch      │  │ → iCloud     │       │
│  │ Code     │  │ transcribe   │  │ → batch      │       │
│  └────┬─────┘  └──────┬───────┘  └──────┬───────┘       │
│       ▼               ▼                 ▼                │
│  ┌───────────────────────────────────────────┐           │
│  │  Whisper (local via superwhisper / .cpp)   │           │
│  └───────────────────┬───────────────────────┘           │
│                      ▼                                    │
│  ┌───────────────────────────────────────────┐           │
│  │  Claude Code / Harbor/Inbox queue          │           │
│  └───────────────────┬───────────────────────┘           │
│                      ▼                                    │
│  OUTPUT (text → TTS → headset)                            │
│  macOS `say` / Piper TTS / ElevenLabs                     │
└──────────────────────────────────────────────────────────┘
```

## Hardware Recommendations

### At Desk — Whisper Dictation

| Pick | Product | Price | Why |
|------|---------|-------|-----|
| **Best** | **superwhisper** (app) | ~$10 one-time | Runs Whisper locally, types directly into any focused window including Terminal/Claude Code |
| Runner-up | whisper.cpp CLI streaming | Free | `brew install whisper-cpp` → `whisper-cpp-stream` |

### On the Go — Whisper While Jogging

| Pick | Product | Price | Why |
|------|---------|-------|-----|
| **Best** | **IASUS NT3 throat mic** | ~$100-150 | Captures vocal cord vibrations — you can mouth words silently. Military-grade noise rejection. |
| Budget | **Code Red Assault-K** | ~$40-60 | Dual-sensor throat mic, subvocal capture. 3.5mm + adapter. |
| Wireless | **Rode Wireless GO II** | ~$250-300 | Clip-on wireless, excellent close-mouth pickup. |

### In the Shower — Waterproof Capture

| Pick | Product | Price | IP Rating | Why |
|------|---------|-------|-----------|-----|
| **Pragmatic** | **Phone in JOTO waterproof pouch** + suction mount | ~$15 | IPX8 | Your phone's mic is the best mic. Touch works through pouch. |
| **Hands-free** | **Jabra Elite 8 Active** earbuds | ~$150 | IP68 | 6-mic array, Bluetooth, fully submersion-rated. |
| Budget | **JBL Endurance Peak 3** | ~$80 | IP68 | Has mic, shower-safe. Mic quality usable for clear dictation. |

## TTS Output (Claude → Ears)

| Approach | Cost | Quality | Setup |
|----------|------|---------|-------|
| **macOS `say`** | Free | Good (Jamie Premium @ 220 wpm) | `claude --print "prompt" \| say -v "Jamie (Premium)" -r 220` |
| **Piper TTS** | Free | Neural, natural | Local install |
| **ElevenLabs** | $5-22/mo | Best quality | API call |

**Quick start:** System Settings > Accessibility > Spoken Content > download enhanced voices.

## Email Integration Pipeline

| Step | What | Status |
|------|------|--------|
| 1 | Universal forwarding → the-user@gmail.com | 🔲 Config only |
| 2 | Gmail MCP auth fix | 🔲 Existing blocker |
| 3 | Claude email triage (scan, categorize, flag urgent) | 🔲 Needs Gmail MCP |
| 4 | Draft replies (Claude prepares, the user approves) | 🔲 Needs Gmail MCP |
| 5 | Daily email digest (non-urgent summary) | 🔲 Scheduled agent |

## Mobile Integration

- **Claude mobile app** — voice mode (hands-free + push-to-talk) for approvals/monitoring
- **Telegram** — scout notifications, inline keyboards for approve/reject
- **Desktop Dispatch** — send tasks from phone
- **Teleport** — `claude --teleport` pulls web/iOS session into terminal
- **Remote Control** — Boris pattern: enable globally, continue work from phone

## Implementation Order

1. **superwhisper** — install, test with Claude Code (~10 min)
2. **macOS TTS** — download Zoe Premium voice, test `say` pipe (~5 min)
3. **JOTO pouch** — order for shower capture (~$15)
4. **IASUS NT3 throat mic** — order for jogging (~$100-150)
5. **Batch transcription script** — whisper.cpp for iCloud-synced Voice Memos (~30 min)
6. **Email forwarding** — configure universal forwarding (~10 min)
7. **Gmail MCP** — unblock auth issue
8. **Hooks integration** — wire TTS into notification hooks (~1 hr)
