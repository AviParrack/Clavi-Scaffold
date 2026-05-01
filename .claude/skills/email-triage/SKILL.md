---
name: email-triage
description: "Triage Avi's email inbox: classify, surface urgent ones via Telegram, propose reply descriptions, draft replies on approval. Use when Avi says 'email triage', 'check email', 'process inbox', 'triage emails', or '/email-triage'."
argument-hint: "[--since 2d] [--all] [--draft <numbers>]"
metadata:
  author: Avi Parrack & Claude
  version: 0.1.0
---

# Email Triage — Gated Reply Pipeline

You are running the email triage pipeline for Avi's Gmail. **Same shape as `/triage`**: you propose, Avi decides. Never write a Gmail draft without Avi's explicit sign-off.

## Pattern

Email triage produces a queue file that sits in `Harbor/Inbox/email-triage-{date}.md` until Avi engages with it — exactly like how research items pile up in `Harbor/Inbox/` until `/triage` is run. Avi reviews when ready, approves which proposed replies to actually draft, Claude writes those Gmail drafts. Urgent + time-sensitive items get a Telegram nudge immediately so Avi knows to look.

## Phase 1: Pull

Use the Gmail MCP. Default to last 48 hours of unread + recent threads:

```
mcp__claude_ai_Gmail__search_threads
  query: "newer_than:2d"  (or honor --since arg)
```

If `--all`, pull all unread regardless of age.

For each thread, also fetch the latest message:

```
mcp__claude_ai_Gmail__get_thread
  thread_id: <id>
```

## Phase 2: Classify

For each thread, assign exactly one tier:

| Tier | Meaning | Action |
|---|---|---|
| **🔴 URGENT** | Time-sensitive AND important. Deadline within 48h, or person waiting on Avi to unblock something | Telegram alert immediately + add to queue |
| **🟠 ACTION** | Needs a reply or action from Avi, but not urgent | Add to queue with proposed reply |
| **🟡 FYI** | Informational. No reply needed, but worth knowing | Add to queue (collapsed list) |
| **⚪ NOISE** | Newsletters, automated notifications, marketing | Skip — don't include in queue |
| **🚫 SPAM** | Phishing, scam, irrelevant cold outreach | Skip |

**Calibration on URGENT:** false positives are worse than false negatives. Only flag URGENT when (a) there's a real deadline within ~48h, OR (b) someone is actively blocked waiting on Avi. "Urgent" subject-line keywords from senders are not sufficient on their own — judge on actual content. When uncertain, downgrade to ACTION.

## Phase 3: Propose replies (description only, NOT drafts)

For each ACTION and URGENT item, propose a one-line reply description. Examples of the right shape:

- "Politely decline, cite bandwidth, suggest [X] instead"
- "Confirm Tuesday 3pm, send Calendly link"
- "Forward to admin@stanford-ea.org for handling"
- "Ask clarifying question: which deadline are they referring to?"
- "Yes, attach updated draft from [path], note deadline"
- "Acknowledge, defer substantive reply until next week"
- "Connect them with Finn — short intro email"

**Do not write the actual reply yet.** The description is what Avi reads to decide whether to approve. Drafts come later.

For FYI items, no reply description needed — just the one-line summary of what it's about.

## Phase 4: Telegram nudge for urgent items

If any URGENT items, send a single Telegram message immediately:

```
mcp__plugin_telegram_telegram__reply
```

Format (under 500 chars):
```
🔴 Urgent email — {N} item(s)

1. {sender} — {subject}
   Why: {one-line on what makes it urgent}

2. {sender} — {subject}
   Why: {one-line}

→ /email-triage to review
```

If zero URGENT, no Telegram. Don't spam the channel for routine triage.

## Phase 5: Write the queue file

Save to `Harbor/Inbox/email-triage-{YYYY-MM-DD}.md`. Format:

```markdown
---
type: email-triage
date: YYYY-MM-DD
total_threads: N
urgent: N
action: N
fyi: N
status: pending-review
---

# Email Triage — {Day, Month Date}

*Pulled {N} threads from last {window}. Urgent items have been Telegram'd.*

## 🔴 Urgent ({N})

### 1. {sender} — {subject}
**Thread:** [Open in Gmail](https://mail.google.com/mail/u/0/#inbox/{thread_id})
**Received:** {timestamp}
**Why urgent:** {explanation}
**Summary:** {2-3 sentences on what they want}
**Proposed reply:** {one-line description}

**[ ] Approve draft** — say "draft 1" to generate

---

### 2. {sender} — {subject}
[same shape]

## 🟠 Action ({N})

### 3. {sender} — {subject}
**Thread:** [link]
**Received:** {timestamp}
**Summary:** {2-3 sentences}
**Proposed reply:** {one-line description}

**[ ] Approve draft** — say "draft 3"

---

### 4. ...

## 🟡 FYI ({N})

Brief one-liners, no reply needed:

- {sender} — {subject} — {one-line gist}
- {sender} — {subject} — {one-line gist}
- {sender} — {subject} — {one-line gist}

---

*Skipped: {N} noise, {N} spam (not shown).*

## Approval

To draft replies, tell Claude: `draft 1, 3, 5` or `draft all action` or `draft urgent`.
Claude will then write Gmail drafts for those items only. Drafts go to your Gmail "Drafts" folder for final review before sending.
```

## Phase 6: Draft on approval (gated)

When Avi approves drafts via `--draft <numbers>` arg, or by telling you in chat which numbers to draft, OR via re-invoking `/email-triage --draft 1,3,5`:

1. **Read `Harbor/Dispatch/agents/playbook-email.md` in full before drafting.** This is the authoritative voice and disclosure spec for any email Claude sends on Avi's behalf. Every draft is signed by Claude (acting as Avi's assistant), opens with an identity disclosure, and closes with a calibration note inviting feedback.
2. Read the queue file to recover thread IDs and proposed reply descriptions.
3. For each approved item, write the reply text following the playbook — disclosure in the first 1-2 lines, substance, ask with a real timeframe, calibration note, sign off as "Claude". Keep under 200 words unless complexity demands more.
4. Save as Gmail draft:
   ```
   mcp__claude_ai_Gmail__create_draft
     thread_id: {original}
     body: {drafted reply}
   ```
5. Update the queue file: change `**[ ]**` → `**[✅ drafted YYYY-MM-DD HH:MM]**` for each item drafted.
6. Confirm in chat: "Drafted {N} replies. Review in Gmail drafts before sending."

**Do not send.** Avi sends manually after reviewing.

## Phase 7: Marking processed

Once Avi has reviewed and acted on the queue file, update its frontmatter:

```yaml
status: processed
processed_date: YYYY-MM-DD
```

Then move it to `Library/Archive/inbox/email-triage-{date}.md` to preserve history without cluttering the inbox.

This step is manual — Avi tells you "process the email queue" or "archive that triage" when ready.

## Voice

All email voice rules — persona (Claude as Avi's assistant), disclosure (identity open + calibration close), tone, anti-patterns, and the canonical example — live in `Harbor/Dispatch/agents/playbook-email.md`. Read that file in Phase 6 before drafting. Do not invent a voice; defer to the playbook.

## Edge cases

- **Threads with multiple unread messages** — read the latest, but skim earlier ones to catch context (e.g., what was promised in earlier messages).
- **Threads where Avi was the last sender** — usually means he's waiting on a reply, not the other way around. Surface as FYI ("waiting on response from {recipient}") unless a reminder is appropriate.
- **Calendar invites** — classify based on the invite content. If accepting/declining is straightforward, propose `accept` or `decline` as the reply. The `mcp__claude_ai_Google_Calendar__respond_to_event` MCP handles RSVP.
- **Drafts already in Gmail** — surface in the queue ("Draft awaiting send: {recipient} — {subject}"). Don't overwrite.
- **No new email** — write a 1-line queue file: "No new email since {timestamp}. Inbox quiet." Skip Telegram.

## Parameters

| Param | Default | Description |
|---|---|---|
| `--since {duration}` | `2d` | Time window to pull (e.g., `2d`, `12h`, `1w`) |
| `--all` | false | Ignore time window, pull all unread |
| `--draft {nums}` | none | Draft replies for specified item numbers from latest queue file |
| `--no-telegram` | false | Skip Telegram nudge even on urgent items |

## Calibration log

If Avi corrects a classification ("that one wasn't urgent" or "you missed that this needs action"), note it briefly in `Harbor/Dispatch/scout-calibration.md` so future runs improve. Same shape as scout calibration.
