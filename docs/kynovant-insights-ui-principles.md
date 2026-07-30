# Kynovant Insights — UI and UX Principles

**Scope:** All Kynovant Insights surfaces: Training, Nutrition, Recovery, Check-In.
**Audience:** Engineers and designers implementing any Kynovant Insights panel.
**Relationship:** This document governs presentation. The Programming Intelligence Doctrine governs calculation. The two must never be confused — how something is determined is separate from how it is shown.

---

## The Five-Second Rule

A coach should understand the overall health of a workout or program within five seconds of opening Kynovant Insights.

The coach should never have to read the top of the page.

If a coach must parse a sentence before understanding the screen, the hierarchy is wrong. If a coach must scroll before seeing the most important signal, the layout is wrong. If a coach must expand a section before knowing whether anything is wrong, the design has failed its primary job.

This rule is not a guideline. It is the governing constraint for every Kynovant Insights layout decision.

---

## Principle 1 — Status Before Detail

**The first thing a coach sees should be overall status. Not findings. Not paragraphs. Not tables.**

The dimensional health of a Blueprint or Program must communicate itself visually, before the coach reads a word. This means:

- Dimension badges use background color and weight, not just text color. A badge reading "HIGH" in an orange container is seen before it is read. A small orange label next to the word "Fatigue:" is read before it is seen.
- Status communicates at the level of dimension first. A coach learns "Movement is flagged" before learning why.
- The header zone — everything visible before scrolling — is reserved for status. Detail belongs below the fold.

**What this rules out:**

- Using only text labels for status (even colored ones) without visual containment.
- Putting a findings list as the first thing in the panel.
- Burying the status row below a header image, navigation, or decorative element.

**What this requires:**

- A fixed header row of dimension chips. Each chip has a background color matched to its worst state. The chips are large enough to distinguish at a glance, not a squint.
- Any dimension that is unknown renders in neutral grey — clearly distinct from healthy (muted) and flagged (warm color). Unknown is not an error; it is an absence of analysis.

---

## Principle 2 — One Highest Priority

**Surface one thing that most needs the coach's attention. Not two. Not five. One.**

Every Kynovant Insights panel surfaces a single **Highest Priority** — the finding with the highest severity and coaching consequence across all dimensions. It appears prominently below the status header, as a dedicated element — not as the first item in a list.

Why one, not two: Two highlighted findings creates comparison. The coach must decide which to look at first. One highlighted finding creates direction. The coach knows where to look.

**What this rules out:**

- "Top 3 findings" summary sections.
- Lists of findings without visual hierarchy — all findings treated as equally important.
- Surfacing multiple error-level findings in the header zone simultaneously.

**What this requires:**

- If there are zero findings: the panel communicates a clean state positively, without a placeholder.
- If there is one or more finding: exactly one is surfaced in the priority zone. The rest live in the findings section below.
- The Highest Priority includes its title and a one-line explanation. Nothing more. Evidence is one tap away.

---

## Principle 3 — Progressive Disclosure

**Surface only enough to orient. Let the coach drive from there.**

Information should flow from most abstract to most concrete. A coach opens a Blueprint and sees its overall health. They notice a flagged dimension. They look at the Highest Priority. They expand it to see evidence. They see which exercises contributed. They see the exact threshold crossed.

The full hierarchy is:

```
Overall Health (dimension status badges)
  ↓
Highest Priority (one-line callout)
  ↓
Dimension (volume / fatigue / movement / joint stress / ...)
  ↓
Finding (title + one-line explanation)
  ↓
Evidence (contributing exercises, specific values, threshold)
  ↓
Underlying Data (raw sets, scores, coverage percentages)
```

Each level is accessible. No level is required before the next. A coach who only needs the top two levels should never be forced through the bottom four.

**What this rules out:**

- Expanding all findings by default.
- Showing evidence inline without a collapse mechanism.
- Requiring the coach to expand before they can see the finding title.

**What this requires:**

- Finding cards default to collapsed (title + one-line explanation visible; evidence hidden).
- Evidence is available in a single interaction — one tap or click.
- Completeness data (coverage percentages) lives at the bottom of the panel, below all real findings. It is informational, never alarming, and never interrupts the flow of real findings.

---

## Principle 4 — Glanceability

**Color, spacing, grouping, and typography should communicate more than text does.**

A Kynovant Insights panel is not a report. It is a dashboard. Dashboards are read in parallel; reports are read in sequence. The design must support parallel reading.

**Color system for dimension status:**

| State | Background | Text | Meaning |
|---|---|---|---|
| OK / Balanced / Moderate | Neutral (gray-100) | gray-600 | No action needed |
| Caution / Elevated / Incomplete | Amber (amber-50) | amber-700 | Worth monitoring |
| High / Imbalanced / Has Errors | Orange (orange-100) | orange-700 | Needs attention |
| Critical | Red (red-100) | red-700 | Block or address immediately |
| Unknown | Gray (gray-50) | gray-400 | Not yet analyzed |

This color system applies to: dimension status badges, finding left-borders, and any inline severity indicators. Severity colors must be consistent across every Kynovant Insights surface — coaches learn the system once.

**Typography hierarchy:**

- Dimension labels: `text-xs uppercase tracking-wider` — structural, never the focus
- Status values: `text-sm font-medium` — the answer, slightly emphasized
- Finding title: `text-sm font-medium` — the most readable content line
- Finding explanation: `text-xs text-gray-500` — supporting, always present
- Evidence: `text-xs font-mono` — data, visually distinct

**Spacing:**

The status header, the Highest Priority zone, and the findings section should each have visible separation. The panel should not read as a continuous document — it should read as three distinct zones.

---

## Principle 5 — Trust Through Explainability

**Every finding must allow a coach to answer: why? which exercises? what rule? what would change this?**

Kynovant Insights is deterministic analysis, not a black box. Coaches are professionals. They do not need to be told what to do — they need to understand what the analysis observed so they can apply their own judgment.

This requires two things of every finding:

**1. Transparent evidence.** Every finding has an evidence section that shows the exact inputs that triggered the rule: which exercises, how many sets, what score, what threshold. A coach should be able to reproduce the finding manually if they want to.

**2. Confidence labeling.** Coaches must be able to distinguish between:
- `certain` findings: deterministic rules that are always correct when they fire. No label needed.
- `heuristic` findings: evidence-informed thresholds that the coach may legitimately override. Label: "This is a guideline. Your coaching judgment applies."
- `incomplete_data` findings: analysis that could not fully run due to missing library data. These render visually muted and live in the Data Quality section, not in the main findings list.

**What this rules out:**

- Generic messages like "High volume detected" with no specifics.
- Hiding the threshold value from the coach ("you have too many sets" without saying how many is too many).
- Mixing `incomplete_data` findings into the main findings list where they compete with real findings for attention.

**What this requires:**

- Every finding card has an expandable evidence section.
- Evidence facts always include: the value that triggered the finding, the threshold that defines the boundary, and the specific exercises or entities involved.
- `incomplete_data` findings are shown only in the Data Quality section at the bottom of the panel.

---

## Principle 6 — Product Language

The following naming conventions are permanent and must be applied consistently across all code, copy, and UI.

| Context | Name |
|---|---|
| Internal architecture | Programming Intelligence Layer (PIL) |
| Internal code | `lib/pil/`, `PilFinding`, `getBlueprintAudit()` |
| Customer-facing product (umbrella) | Kynovant Insights |
| Domain navigation | Training · Nutrition · Recovery · Check-In |

**Rules:**

- "PIL" and "Programming Intelligence Layer" must never appear in coach-facing UI copy, labels, tooltips, or error messages.
- "Kynovant Insights" is the umbrella. It should appear in the panel header, the nav item, and the CTA button.
- "Training" (not "Program") is the navigation label for the programming analysis domain. "Program" already names a product entity in HQ and must not be overloaded.
- When labeling a specific panel scoped to one Blueprint, use "Blueprint Intelligence" as the contextual sub-label beneath the "Kynovant Insights" umbrella.
- Finding codes (`VOLUME_HIGH_DIRECT`, `RECOVERY_SAME_DAY`) must never appear in coach-facing UI — they are internal identity keys for persistence and engineering. Use `finding.title` for display.

---

## Surface-Level Checklist

Before shipping any Kynovant Insights UI surface, verify:

**Five-Second Rule**
- [ ] The status of every dimension is visible without scrolling
- [ ] A first-time viewer can identify "something needs attention" without reading a word
- [ ] The Highest Priority is visually distinct from the rest of the findings

**Hierarchy**
- [ ] Dimension status → Highest Priority → Findings → Evidence is the order, never reversed
- [ ] Finding cards default to collapsed
- [ ] `incomplete_data` findings are in the Data Quality section, not mixed with real findings

**Color and typography**
- [ ] Status badge colors follow the system defined in Principle 4
- [ ] Finding left-border colors match severity
- [ ] Evidence is in `font-mono` and visually distinct from prose

**Trust**
- [ ] Every finding has an expandable evidence section
- [ ] Every `heuristic` finding labels itself in its expanded state
- [ ] The threshold value is always visible in evidence

**Language**
- [ ] No finding code appears in UI copy
- [ ] Customer-facing copy uses "Kynovant Insights" not "PIL"
- [ ] Domain navigation uses "Training" not "Program"
