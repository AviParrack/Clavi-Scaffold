---
name: skill-list
description: "Show all available skills organized by category. Use when the user says 'what skills do I have', 'list skills', 'show skills', 'what can you do', or '/skill-list'."
metadata:
  author: Avi Parrack & Claude
  version: 0.1.0
---

# Skill List

Show all available skills, organized by category. Read the .claude/skills/ directory and present them in a scannable format.

## Output Format

```markdown
# Available Skills

## Core (always in context)
| Skill | What it does |
|---|---|
| /triage | Process inbox — sort research into Gold/Green/Yellow/Red |
| /research-sprint | Automated deep research on any topic |
| /draft-it | First draft in your voice from raw notes |
| ... | |

## Daily Operations
| /morning-briefing | Calendar + todo + inbox + scouts → daily summary |
| /voice-capture | Voice memos → transcribe → extract todos → inbox |
| /memory-synthesis | Weekly memory cleanup + pattern promotion |
| ... | |

## Epistemic Tools
| /ask-many-times | Same prompt → 10 instances (stability test) |
| /ask-many-ways | 10 framings + sycophancy test |
| /ask-mega | 110-instance robustness stress test |
| /epistemax | Full epistemic audit (chains 5 sub-analyses) |
| ... | |

## Creative
| /songwriting | Songwriting assistant |
| /sample-extraction | Extract audio clips from YouTube/audio |
| ... | |

## Skill Packs (invoke via /slash-command, not in context)
- **Scientific** (~175): /sci-arxiv, /sci-matplotlib, /sci-pytorch-lightning...
- **Academic** (4): /acad-deep-research, /acad-academic-paper...
- **Engineering** (8): /gstack-browse, /gstack-review, /gstack-ship...
- **Forethought** (6): /forethought-publish, /forethought-style...

Total: [N] skills available
```

## How to generate

1. List all directories in `.claude/skills/`
2. For each, read the `description` field from SKILL.md frontmatter
3. Categorize by prefix (sci-*, gstack-*, acad-*) and by function
4. Present as the table above
5. Count total and note how many are core (model-invocation on) vs packs (off)
