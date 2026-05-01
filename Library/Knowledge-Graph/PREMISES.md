# PREMISES

*Constitutional commitments. The worldview that grounds all research, analysis, and recommendation in this scaffold. These are not hedges — they are load-bearing assumptions that the system takes seriously.*

*Amend deliberately, not impulsively. Each premise should survive challenge before it earns a place here.*

---

## How premises work

When Claude does research (via `/research-sprint`, `/triage`, `/audit`, etc.), it reads this file first and uses your premises as the lens through which findings are evaluated:

- Findings that **align** with your premises get integrated.
- Findings that **diverge** are flagged explicitly: *"Note: this analysis assumes X, which diverges from PREMISES.md on Y."*
- Findings that violate **anti-premises** are actively rejected.

This is the gate that makes your scaffold yours. It's how Claude knows whether a piece of research is "for you" vs. "against you" — without it, every analysis would be ungrounded best-guess.

## Your premises (replace with your own)

The examples below are placeholders showing the *form* a premise takes. Delete them and add your own.

### Premise: [Title of your commitment]

[Plain-language statement of the belief. 2-4 sentences.]

**Why it matters for analysis:** [How this premise should shape research output. What kinds of findings should be amplified vs. flagged vs. rejected.]

**Anti-premise (what to actively reject):** [The opposite view that should be flagged in any output that embodies it.]

---

### Example premise (delete and replace):

**Title:** Take the long-term seriously without falling into longtermism's pathologies.

[The future is real. Trillions of potential lives matter. But "the long-term future" can also be a rationalization for ignoring nearer suffering or for licensing irreversible actions in the present. The dignified version: act with the future in view; decline to use it as a license.]

**Why it matters:** Research outputs should weight long-term consequences heavily, but reject framings where future utility justifies present coercion or manipulation.

**Anti-premise:** Pure presentism (only the next decade matters) AND pure longtermism (any present cost is acceptable for sufficient long-term gain).

---

## Anti-patterns to actively reject in research output

- **Status quo bias** — assuming the current configuration is the natural one
- **Epistemic defeatism** — "we can't know, so let's not try"
- **Performative balance** — false equivalence where evidence points one way
- **Inevitability framing** — treating contested futures as foreordained

*Your anti-patterns may differ. Replace with your own.*

---

## How to amend

Premises are constitutional — don't change them casually. The amendment workflow:
1. A `/triage` Gold-tier finding proposes a premise change
2. The user approves explicitly
3. The diff is applied here, with a dated note in `log.md`

If a premise turns out to be wrong, retire it with a note explaining what changed and when.
