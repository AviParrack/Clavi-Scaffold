# Crossroads — Northwest

*The trust boundary between the world and the scaffold. All external code we depend on lives here — friends' repos, third-party skill collections, anything we'd otherwise install as a submodule.*

## What's Here

- [repos.yaml](repos.yaml) — the manifest. Every external repo registered here is whitelisted. Adding to this file = trusting the source.
- [Network.md.example](Network.md.example) — template for personal contacts and collaborator notes. Rename to `Network.md` when you start populating it.
- *(Whitelisted external repos clone into this folder when you run `/crossroads-add`.)*
- `log/` — install history, revert events (created on first install).

## How It Works

Four jobs, four skills:

| Job | Skill | When |
|---|---|---|
| **Add** a new whitelisted repo | `/crossroads-add <github-url>` | Manual, on demand |
| **Watch** for updates across all whitelisted repos | `/crossroads-scan` | Overnight, 4:50 AM |
| **Apply** approved updates | `/crossroads-install` (invoked from `/triage`) | After review |
| **Audit** for security issues (Phase 2) | `/crossroads-audit` | Weekly |

The trust model: **option (a)** — the whitelist is the gate. Once a repo is in `repos.yaml`, we trust whoever can push to it. New files don't trigger extra review beyond the standard scout summary.

## Update Flow

```
overnight scan (4:50 AM)
  → reads remote refs of every repo in repos.yaml (read-only)
  → for repos with new commits, Claude reads the diff and writes value-prop summary
  → Harbor/Inbox/crossroads-YYYY-MM-DD.md   (empty days produce no file)

User reviews via /triage
  → install: /crossroads-install moves the submodule pointer + applies symlinks + commits
  → skip:    note in repos.yaml as scanned-but-not-pulled
  → revert:  roll back to previous pinned_sha (Phase 1.5)

Each approved update is a single commit in this repo's history — fully revertable.
```

## See Also

- [Town-Hall/Scaffold/crossroads-design.md](../Town-Hall/Scaffold/crossroads-design.md) — full design doc, schema details, phasing
- [Clavi-Scaffold-Guide.md](../Clavi-Scaffold-Guide.md) — full scaffold guide (system map, module I/O, automation)
