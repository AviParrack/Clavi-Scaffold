---
description: Verify workspace integrity — symlinks, submodules, hooks, settings, and key files
user_invocable: true
---

# Health Check

Run a comprehensive workspace integrity check. Verify everything is pointing in the right direction.

## Checklist

### 1. Submodules
```bash
git submodule status
```
All submodules should show a commit hash (not a `-` prefix, which means uninitialized). Expected submodules:
- `gstack/`
- `claude-scientific-skills/`
- `academic-research-skills/`
- `trailofbits-config/`
- 

### 2. Skill Symlinks
Verify all symlinks in `.claude/skills/` resolve to real targets:
```bash
for link in .claude/skills/*/; do
  if [ -L "${link%/}" ]; then
    target=$(readlink "${link%/}")
    if [ ! -e "${link%/}" ]; then
      echo "❌ BROKEN: ${link%/} -> $target"
    else
      echo "✅ OK: ${link%/}"
    fi
  fi
done
```

Expected prefixes and counts:
- `gstack-*`: 8 skills
- `sci-*`: 22 skills
- `acad-*`: 4 skills
- Custom skills: see `.claude/skills/` for the current set

### 3. Hooks
Check that hook scripts exist and are executable:
```bash
ls -la ~/.claude/scripts/security-gate.py
ls -la ~/.claude/scripts/notify.py
```
Verify hooks are configured in `~/.claude/settings.json` — should have entries for Notification, Stop, and PreToolUse (Bash matcher).

### 4. Security Layer
Verify deny rules exist in settings:
```bash
python3 -c "import json; d=json.load(open('$HOME/.claude/settings.json')); print(f'{len(d[\"permissions\"][\"deny\"])} deny rules')"
```
Should be 30+ deny rules covering credential paths and destructive commands.

Check project-level settings exist:
```bash
cat .claude/settings.json 2>/dev/null || echo "⚠️ No project-level settings.json"
```

### 5. Key Files
Verify core orientation files exist and aren't empty:
```bash
for f in CLAUDE.md README.md Town-Hall/User/User.md Library/Knowledge-Graph/PREMISES.md Library/Knowledge-Graph/KEY_FINDINGS.md Clavi-Scaffold-Guide.md; do
  if [ -s "$f" ]; then
    echo "✅ $f ($(wc -l < "$f") lines)"
  else
    echo "❌ MISSING OR EMPTY: $f"
  fi
done
```

### 6. Rules Files
```bash
ls -la .claude/rules/*.md
```
Expected: writing-voice.md, commit-style.md, space-research.md (at minimum).

### 7. Dependencies
Check key external tools:
```bash
which terminal-notifier 2>/dev/null && echo "✅ terminal-notifier" || echo "⚠️ terminal-notifier not installed (brew install terminal-notifier)"
which gitleaks 2>/dev/null && echo "✅ gitleaks" || echo "⚠️ gitleaks not installed"
npx ccusage@latest --version 2>/dev/null && echo "✅ ccusage" || echo "⚠️ ccusage not available"
```

### 8. .gitignore
Verify sensitive patterns are excluded:
```bash
cat .gitignore
```
Should include: `.env`, `.claude/settings.local.json`, `*.local`, `.DS_Store`, `node_modules/`

## Output Format

Present results as a summary table:

```
┌─────────────────────┬────────┬───────────────────────────┐
│ Component           │ Status │ Notes                     │
├─────────────────────┼────────┼───────────────────────────┤
│ Submodules (5)      │ 🟢/🔴  │                           │
│ Symlinks (35+)      │ 🟢/🔴  │ X broken                  │
│ Hooks (3)           │ 🟢/🔴  │                           │
│ Security deny rules │ 🟢/🔴  │ N rules                   │
│ Key files (7)       │ 🟢/🔴  │                           │
│ Rules files (3+)    │ 🟢/🔴  │                           │
│ Dependencies        │ 🟢/🟡  │ missing: X                │
│ .gitignore          │ 🟢/🟡  │                           │
└─────────────────────┴────────┴───────────────────────────┘
```

Flag anything that needs attention with 🚩.
