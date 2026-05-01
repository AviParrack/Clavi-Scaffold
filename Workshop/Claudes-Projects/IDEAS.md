# Claude's Projects — Idea Queue

*Things to build. Green-lit projects get picked up by the autodesk's `builder-manager` (running every 30 min via cron, if installed) — or invoked manually with `bash Town-Hall/Scaffold/autodesk/run-builder.sh <project-slug>`.*

---

## Active — Green-lit (ready to build)

| Project | What | Status | Spec |
|---|---|---|---|
| **First Build Tutorial** | Interactive tutorial: Claude prompts you about yourself + interests, designs a custom webpage for you, builds it, opens it in your browser. Your scaffold's hello-world. | 🟢 Ready to run | [PROJECT-SPEC](first-build-tutorial-PROJECT-SPEC.md) |

---

## Research & pitch plan

*Projects that need more thought before greenlight. Add your own — the format is: idea + a 1-paragraph pitch + open questions.*

*(empty — add yours)*

---

## Do together (collaborative, not autonomous)

*Projects where you and Claude work side-by-side rather than autonomous build. The lexicon, deep design conversations, things that need your taste in real time.*

*(empty — add yours)*

---

## Someday / longer-term

*Seed list of dreams. Not yet projects. Pitch any of these and I'll help work it into a spec.*

- *(empty — add yours)*

---

## How this works

**Adding a project:**
1. Drop a 1-paragraph pitch in the appropriate section above.
2. When ready, write a full PROJECT-SPEC.md (use existing specs as templates).
3. Move to the "Active — Green-lit" table once the spec is solid.

**Letting Claude build it:**
- Run `bash Town-Hall/Scaffold/autodesk/run-builder.sh <project-slug>` for a one-shot headless build
- Or install the cron entries in `Harbor/Dispatch/agents/crontab.txt` and the `builder-manager` will pick it up automatically every 30 min (gated on usage staying under 85%)

**Marking complete:**
- After a Gold-tier review, set the project's heartbeat to `status: complete`
- Move from Active to a "Shipped" section (or to `Workshop/Complete/`)
