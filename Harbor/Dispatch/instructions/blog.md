# Dispatch Template: Blog / Forethought Website

## Forethought Blog
- Host: forethought.org (or current domain)
- Style: full Forethought voice — read forethought-patterns.md
- Use `/forethought-publish` skill for the full publication pipeline
- Formatting: Forethought orange (#E87040) callout boxes, methodology box required

## Avi's Personal Blog
- Voice: first-person, Avi's personal register (not institutional)
- Use `/draft-it` for first drafts
- Style guide: `Workshop/backburner/Blog/02-style/README.md`
- ~40% Sagan, ~40% Carlsmith, ~20% Ord + Avi

## General Blog Quality Gate
- Does the first paragraph make someone want to read the rest?
- Is there a clear "so what?" — why should the reader care?
- Would the reader learn something they didn't know, or think about something differently?
- Has it been proofread? (`/proofread`)

## Log
After dispatching, append to `Harbor/Dispatch/log/`:
```
## YYYY-MM-DD — Blog — [title]
Platform: [Forethought / personal]
URL: [once posted]
Source project: [Workshop/project]
Word count: [N]
```
