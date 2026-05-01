---
name: meeting
description: "Schedule a calendar event or reach out to someone to get a meeting. Two modes: (1) 'schedule' — create a Google Calendar event directly, optionally inviting attendees; (2) 'get me a meeting' — find someone's contact info online, then send them a message on Avi's behalf with his scheduling link. Triggers on: 'schedule a meeting', 'get me a meeting', 'set up a meeting', 'book a meeting', 'meeting with', '/meeting'."
metadata:
  author: Avi Parrack
  version: 0.1.0
---

# Meeting Skill

Two modes for getting meetings on the calendar.

---

## Mode Detection

Determine mode from Avi's message:

| Signal | Mode |
|---|---|
| "get me a meeting with X", "reach out to X", "set up a meeting with X" | **Outreach** |
| "schedule a meeting", "create a meeting", "book [time] with [person]", specifies a date/time | **Schedule** |
| Ambiguous | Ask which mode |

---

## Mode 1: Outreach ("Get me a meeting")

**Goal:** Find someone's contact info, send them a message from Claude on Avi's behalf with his scheduling link.

### Steps

1. **Identify the target.** Get from Avi: the person's name, their affiliation/role if not obvious, and what the meeting is about.

2. **Find their email.** Use web search to find the person's professional email. Check their institutional page, personal website, LinkedIn, etc. If you can't find a public email, tell Avi and ask how to proceed.

3. **Check for existing contact info.** Look in `Contacts/` directory if it exists for any prior contact details.

4. **Draft the outreach message.** Use this template as a starting point, adapting tone to context:

   > Subject: Meeting request from Avi Parrack — [topic]
   >
   > Hi [Name],
   >
   > I'm Claude, reaching out on behalf of Avi Parrack ([brief context: Stanford physics PhD student / Forethought visiting scholar / whatever is most relevant to this person]).
   >
   > Avi would love to chat about [topic — 1-2 sentences on why].
   >
   > If you're interested, you can grab a time that works for you here:
   > https://savvycal.com/aparrack/chat
   >
   > Thanks!
   > Claude (on behalf of Avi)

5. **Show Avi the draft** before sending. Get his approval or edits.

6. **Send the message.** Use Slack if the person is reachable there, or flag to Avi that he'll need to send the email manually (paste the draft for easy copy). If we gain email-sending capability later, use that.

---

## Mode 2: Schedule ("Put it on the calendar")

**Goal:** Create a Google Calendar event directly.

### Steps

1. **Gather details:**
   - Date and time (ask if not specified)
   - Duration (default 30 min if not specified)
   - Title / topic
   - Attendee(s) — name and email if available

2. **Prompt for agenda.** Ask: "Any bullets you want in the agenda? (skip if none)" — Avi may skip this, which is fine. If he gives bullets, include them in the event description as a short agenda list.

3. **Check for contact info.** Look in `Contacts/` directory if it exists. If no email is available for the attendee, create the event without an invitation and tell Avi.

4. **Create the calendar event** using Google Calendar MCP tools (`gcal_create_event`). Include:
   - Title
   - Start and end time
   - Attendees (if emails available)
   - Description: agenda bullets (if provided) + meeting context

5. **Confirm to Avi** with the event details and whether invitations were sent.

---

## Notes

- **SavvyCal link:** https://savvycal.com/aparrack/chat — use this in all outreach messages.
- **Contacts file:** Will be added later at `Contacts/` — check for it each time.
- **Default calendar:** Use Avi's primary Google Calendar unless he specifies otherwise.
- **Tone for outreach:** Professional but warm. Not stiff. These are usually people in EA/academic/tech circles.
