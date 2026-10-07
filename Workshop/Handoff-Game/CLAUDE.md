# Handoff-Game

Browser tower defense about AI control. Static site, vanilla JS ES modules, Canvas 2D, no build step.

- Read [HANDOFF.md](HANDOFF.md) for current state, then [README.md](README.md) for run/test commands.
- [SPEC.md](SPEC.md) is the design spec (v0.1). Deviations are listed in HANDOFF.md.
- Rules: the sim (`game/src/sim/`) never touches the DOM. Renderers only read state. All tuning lives in `game/src/config/`.
- Run `node game/test/headless.mjs` before committing sim changes.
