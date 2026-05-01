# Dispatch Template: Blog / Personal Site

## Personal Blog
- Voice: first-person; read `Town-Hall/User/User.md` for register
- Use `/draft-it` for first drafts
- Style guide: any path-scoped rule under `.claude/rules/writing-voice.md`

## Org-Specific Blog (if user belongs to an org with its own publication style)
- Configure in `Embassy/[Org]/CLAUDE.md` with style guide + brand assets
- Use a custom org-specific skill (e.g., `/orgname-publish`) if the user maintains one
- Specifics (callout colors, methodology box, byline format) live in the org's Embassy folder

## General Blog Quality Gate
- Does the first paragraph make someone want to read the rest?
- Is there a clear *"so what?"* — why should the reader care?
- Would the reader learn something they didn't know, or think differently about something they did?
- Has it been proofread? (`/proofread`)

## Log
After dispatching, append to `Harbor/Dispatch/log/`:

```
## YYYY-MM-DD — Blog — [title]
Platform: [personal / org]
URL: [once posted]
Source project: [Workshop/project]
Word count: [N]
```
