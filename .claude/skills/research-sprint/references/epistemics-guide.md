# Epistemic Standards Reference

Detailed guidance for applying the epistemic standards defined in the main SKILL.md. This document provides examples, calibration anchors, and common failure modes.

---

## Confidence Calibration

The four-level scale (High / Medium / Low / Speculative) is only useful if calibrated honestly. Here's how to calibrate:

### High Confidence

**What it means:** You'd bet real money on this. Multiple independent, high-quality sources agree. The claim is widely accepted among domain experts.

**Examples:**
- "Russia's Internet Research Agency operated troll farms targeting the 2016 US election" -- confirmed by Mueller indictment, Senate Intelligence Committee report, platform disclosures, and independent journalism.
- "Global average temperatures have increased by ~1.1°C since pre-industrial levels" -- confirmed by NASA, NOAA, Met Office, and IPCC independently.

**Common mistake:** Marking something "high confidence" because it *feels* true or because you've seen it repeated often. Repetition in training data ≠ high-quality sourcing. Always trace back to independent primary sources.

### Medium Confidence

**What it means:** The balance of evidence supports this, but there are meaningful gaps, conflicting signals, or limited independent verification.

**Examples:**
- "AI-generated content will meaningfully increase the volume of influence operations by 2027" -- directionally supported by capability analysis and early examples, but limited empirical data on actual deployment at scale.
- "Platform moderation reduces the reach of coordinated inauthentic behaviour by 50-80%" -- supported by some platform reports, but platforms have conflicted incentives and limited external verification.

**Common mistake:** Defaulting to "medium" for everything. This defeats the purpose. If you find yourself marking most claims "medium," you're not calibrating -- you're avoiding judgment. Force yourself to distinguish between claims where you'd bet 3:1 and claims where you'd bet 5:4.

### Low Confidence

**What it means:** Based on limited evidence, a single source, extrapolation from adjacent domains, or early/preliminary findings. Treat as a working hypothesis, not a conclusion.

**Examples:**
- "Chinese influence operations targeting US elections are less effective than Russian operations because they prioritise long-term reputation over short-term disruption" -- plausible reasoning from observed patterns, but limited direct evidence on relative effectiveness.
- "The 2024 election saw a 300% increase in AI-generated political content" -- based on one platform report with unclear methodology.

**Common mistake:** Presenting low-confidence claims without flagging them. The reader trusts that your high-confidence claims are solid. If you sneak low-confidence claims in without labels, you poison the whole output.

### Speculative

**What it means:** An informed guess. You're reasoning from first principles, analogies, or adjacent evidence. There may be no direct evidence at all. Flag clearly and explain your reasoning chain so the reader can evaluate it.

**Examples:**
- "If AI coding assistants reach 10x productivity gains, the offense-defense balance in cybersecurity will shift dramatically toward offense" -- logical extrapolation but no empirical data yet.
- "The 'deep fake vaccine' -- widespread public awareness of deepfakes -- may paradoxically increase vulnerability to real information being dismissed as fake" -- theoretical argument with some anecdotal support but no systematic evidence.

**Common mistake:** Dressing up speculation as analysis. If the underlying evidence is speculative, the conclusion is speculative, no matter how rigorous the reasoning chain.

---

## Crux Identification Patterns

A crux is the empirical fact that a conclusion depends on most heavily. Naming cruxes makes your analysis updateable -- when new evidence arrives, the reader can immediately see which conclusions need revision.

### Good Crux Identification

**Pattern:** "This conclusion hinges on [specific empirical claim]. If [claim] turned out to be false, we would instead expect [alternative conclusion]."

**Example:**
> **Conclusion:** Platform self-regulation is unlikely to adequately address AI-generated influence operations.
>
> **Crux:** This hinges on the assumption that detection of AI-generated content will remain significantly harder than generation. If reliable detection methods emerge (e.g., watermarking standards become universal, or detection models achieve >95% accuracy on adversarial content), platform self-regulation could become adequate, since platforms would have the technical capability to enforce policies.

### Bad Crux Identification

- **Too vague:** "This depends on how things develop." (Everything depends on how things develop. Name the specific empirical variable.)
- **Not empirical:** "This depends on whether governments prioritise this." (This is a prediction about political will, not an identifiable empirical crux.)
- **Multiple cruxes listed without ranking:** "This depends on detection capability, political will, platform incentives, and public awareness." (Which one matters most? If you had to pick one thing that would most change the conclusion, what is it?)

### How to Find the Crux

Ask yourself: "If I woke up tomorrow and learned one new fact that completely changed my conclusion, what would that fact be?" That's your crux.

---

## Steelmanning Guide

Steelmanning means presenting the strongest possible version of an opposing view -- not a weakened version you can easily dismiss.

### The Test

After writing your steelman, ask: "Would a smart person who holds this view recognise this as their argument?" If the answer is no, you haven't steelmanned -- you've strawmanned with extra steps.

### Good Steelmanning

**Topic:** Whether social media platforms should be required to remove AI-generated political content.

> **Steelmanned opposition:** The strongest argument against mandatory removal is that it creates a censorship infrastructure that will inevitably be misused. Detection technology is imperfect, so mandatory removal will produce false positives -- real content flagged as AI-generated and removed. In politically charged contexts, these false positives will disproportionately affect controversial but genuine speech. Furthermore, the definition of "AI-generated" is becoming meaningless as AI tools become standard in all content creation (grammar checking, image editing, video production). Drawing a line between "AI-assisted" and "AI-generated" is technically arbitrary and politically manipulable.

### Bad Steelmanning

> **Bad version:** "Some people argue that platforms shouldn't have to remove AI content because they think censorship is bad."

This isn't a steelman. It's a vague gesture at an opposing view that makes it easy to dismiss. It doesn't engage with the actual arguments.

### When Views Are Genuinely Lopsided

Sometimes the evidence really does overwhelmingly support one side. In these cases, don't manufacture false balance. Instead, be explicit: "The strongest counterargument we can identify is [X], but we find it unpersuasive because [Y]. We'd update if [Z] new evidence emerged."

---

## Source Evaluation Checklist

For each major source, evaluate:

1. **Independence:** Is this source independent of the claim being made? (A company's own report on its safety practices is not independent.)
2. **Expertise:** Does the source have relevant domain expertise?
3. **Incentives:** What are the source's incentives? Do they benefit from the claim being true?
4. **Methodology:** Is the methodology described? Is it appropriate for the claim?
5. **Replication:** Has the finding been replicated? By whom?
6. **Recency:** How old is this evidence? Is recency relevant to this claim?

### Red Flags

- Source is the only one making this claim
- Source has a financial interest in the conclusion
- Methodology is not described or is inappropriate
- The claim is suspiciously round-numbered or precise
- The source is a secondary report citing another source you can't access
- The evidence is from training knowledge and can't be web-verified

---

## Common Epistemic Failure Modes

### 1. Anchoring on the First Source

You find one good source early and everything after gets interpreted through that lens. **Fix:** Deliberately search for sources that disagree with your first source before forming a view.

### 2. Treating Absence of Evidence as Evidence of Absence

"I didn't find evidence that X is happening, therefore X is not happening." **Fix:** Distinguish between "we looked and found nothing" (some evidence against) and "we didn't look" or "the data doesn't exist" (genuine uncertainty).

### 3. Conflating Correlation and Mechanism

"Countries with more social media use have more political polarisation, therefore social media causes polarisation." **Fix:** Always ask: what's the mechanism? Is reverse causation possible? Are there confounders?

### 4. Round-Trip Sourcing

Source A cites Source B, which cites Source A. This is especially common in training data, where multiple articles may all trace back to a single original claim. **Fix:** Always trace claims back to the primary source. If you can't find the primary source, flag the claim.

### 5. Motivated Continuation

You've already written 500 words arguing for position X and then find strong evidence for not-X. The temptation is to downplay the counterevidence. **Fix:** When you find evidence against your emerging view, give it *more* weight than confirming evidence, not less. This counteracts the natural bias.

---

*This guide will be refined based on researcher feedback. Known areas for improvement: adding calibrated probability ranges, domain-specific source evaluation criteria, and worked examples from completed research sprints.*
