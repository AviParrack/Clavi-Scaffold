# Dispatch Template: Twitter / X

## Platform Constraints
- **Character limit:** 280 per tweet (threads unlimited but each tweet ≤ 280)
- **Media:** Up to 4 images, 1 video, or 1 GIF per tweet
- **Links:** Count ~23 characters regardless of actual URL length

## The user's account(s)
- See `Town-Hall/User/Web-Presence/links.md` for X handle(s)
- Voice: read `Town-Hall/User/User.md` for register
- Optional: a per-account voice file at `Workshop/Twitter/accounts/[handle]/VOICE.md` if the user maintains multiple accounts with distinct registers

## Formatting Rules
- No thread numbering (1/N) — just post the thread, X handles it
- Lead with the hook — first tweet must stand alone and compel the click
- No hashtags in prose (only at end if relevant)
- Tag people only when genuinely relevant, not for engagement farming
- Link to source in the final tweet of a thread, not inline

## Quality Gate
- Would a careful reader find this interesting? (not just "followers")
- Does it sound like a human wrote it? Read it aloud.
- Does it add to the discourse or just add noise?

## Log
After dispatching, append to `Harbor/Dispatch/log/`:

```
## YYYY-MM-DD — X / Twitter — [topic]
Account: [handle]
Content: [tweet text or thread summary]
Source project: [Workshop/project if applicable]
```
