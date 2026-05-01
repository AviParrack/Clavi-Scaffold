# Scout Calibration

*Running notes on what the user gets excited about vs. what they skip. Updated after each triage of opportunity-scan, network-scout, and watchlist-monitor results. Used by future Claude instances to improve recommendations.*

*This file starts empty. Calibration accrues over time as the user triages scout output and Claude logs the patterns.*

---

## Opportunity Patterns

### What the user gets excited about

*(populated as calibration accrues — examples might look like: "Time-sensitive convergence on active projects rates S-tier", "Fellowships with explicit deadlines rate A-tier")*

### What the user skips

*(populated as calibration accrues — items consistently rejected get patterned here)*

### Emerging rules

*(meta-rules synthesized from individual cases — e.g., "Multiple signals pointing at the same action = highest priority")*

---

## Network Patterns

### What the user gets excited about

*(networking targets that fill explicit gaps, warm intro paths, intellectual sparring partners — these patterns surface here)*

### What the user skips

*(targets without a clear "why now", cold outreach without paths, distant relevance)*

---

## Watchlist Patterns

### High-signal items

*(watch items where most weekly news got read and acted on)*

### Low-signal items

*(items that consistently get skipped — candidates for retirement)*

---

## How calibration works

After every `/triage` of a scout output, Claude updates this file with what was rated highly vs. skipped, plus a hypothesis about the underlying pattern. The next scout run reads this file and weights its recommendations accordingly.

Calibration is **bidirectional learning**:
- The user trains Claude on what's valuable
- Claude trains itself by extracting patterns
- Over weeks the scouts get progressively better fit for the user

If a recommendation is consistently off, tell Claude in the triage chat — that feedback ends up here and the next scout adjusts.
