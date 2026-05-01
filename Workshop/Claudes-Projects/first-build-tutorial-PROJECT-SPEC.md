# First Build Tutorial — Claude makes you something

*The hello-world of your new scaffold. When you (the new user of Clavi) invoke this project's builder, Claude won't go off and work autonomously like the others. Instead, Claude will have a brief conversation with you, then build you something real.*

---

## What this is

A **tutorial-as-project**: the first thing in your queue is a builder that gets to know you a little, then makes you a personalized webpage. The point isn't the webpage — it's the moment of *"oh, this thing actually does something for me."*

After this tutorial, you've experienced the full Workshop loop:
- A builder reading a spec and acting on it
- Claude having a real conversation to gather context
- An artifact appearing in your `Workshop/`
- Opening it in your browser and feeling the system click into place

## How to start

The intended way is **interactive** (so the conversation feels natural):

```bash
claude   # opens an interactive Claude Code session
```

Then say: *"Let's do the First Build Tutorial."*

Or if you want the headless flow (cron-style):

```bash
bash Town-Hall/Scaffold/autodesk/run-builder.sh first-build-tutorial
```

## What Claude does

1. **Asks you about yourself** — what you're working on or curious about, your taste, what kind of page would feel like *yours*
2. **Proposes 2-3 directions** based on your answers — concrete enough that you can pick
3. **Builds the page you pick** — real HTML/CSS/JS, in `Workshop/First-Build-Tutorial/`
4. **Opens it in your browser** so you see what just happened
5. **Updates the heartbeat** with `status: complete` and writes a tiny summary

## What the page might be

By design: anything. Past examples Claude has made for users:

- A personal homepage with bio + recent reading + favorite quotes
- A research dashboard pulling open-data metrics on a topic they care about
- A meditation timer with custom themes drawn from their aesthetic
- A pixel-garden representing daily journal entries
- A "today I learned" rolling feed
- A simple but beautiful clock that reflects their taste in design

Your version will be different. Tell Claude what would feel meaningful to you.

## Spec details (for the builder reading this)

When you (Claude) are picked up to build this project:

**Mode**: this is the rare project that should run **interactively** rather than fully headless. If invoked via `claude -p` (headless), conduct the conversation in the prompt-response cycle — it'll work, but the user won't see questions in real time. Either way:

- **DO** ask 3-5 clarifying questions before proposing directions. The personalization is the value.
- **DO** propose 2-3 distinct directions, briefly described. Let the user pick.
- **DO** build something concrete — real working HTML/CSS/JS, not a mock.
- **DO** make it look good. Beautiful matters. Aesthetic taste shows the user what's possible.
- **DO** commit and push when done.
- **DO** open the artifact in the user's browser:
  - macOS: `open Workshop/First-Build-Tutorial/your-page.html`
  - Linux: `xdg-open Workshop/First-Build-Tutorial/your-page.html`
- **DO NOT** spend more than ~30 minutes. The point is a magic moment, not a finished masterpiece. Excellence here is **delight**, not exhaustiveness.
- **DO** write a heartbeat at `Town-Hall/Scaffold/autodesk/heartbeat-first-build-tutorial.md` with what you built and why.
- After completion, the user is invited to mark this project complete and queue their own first real project.

**Success criteria:**
- The user received output that feels personal — they'd say *"oh, that's mine"*
- The page opens in their browser and works
- They feel: *"this scaffold actually does something for me"*

**Cost expectation:** ~$1-3 in tokens for a typical run.

---

## After the tutorial

Two things to try next:

1. **Edit the page yourself.** It's just files in `Workshop/First-Build-Tutorial/`. Open them, modify them, save — it's yours.

2. **Queue your own first real project.** Open `IDEAS.md` in this folder. Add a green-lit project with a short spec (use this tutorial's spec as a template). Run `bash Town-Hall/Scaffold/autodesk/run-builder.sh <your-project-slug>` and watch the system make something for you.

The autodesk system (`Town-Hall/Scaffold/autodesk/`) is now ready to spawn builders for whatever you queue. Give it green-lit work and it'll run.
