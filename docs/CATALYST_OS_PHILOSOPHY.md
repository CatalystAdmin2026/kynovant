# Kynovant — Product Philosophy

Established 2026-07-22

---

## What This Document Is

This is the constitutional document for Kynovant. It does not describe how the system is built — it describes how we decide what to build, how to present it, and what a feature must accomplish before it ships.

Every product decision should be traceable to one or more principles here. When two reasonable engineers disagree on an approach, this document breaks the tie.

---

## Core Principles

---

### 1. Coaching over tracking

Kynovant is a coaching platform. It is not a fitness tracker, a habit app, or a dashboard.

The distinction matters at every level of the product. A fitness tracker shows you what happened. A coaching platform shows you what it means and what to do about it. Data without interpretation is noise. Interpretation without relationship is hollow.

**Applied in the portal:**
The Progress page leads with a Goal Status Hero and a Narrative Summary written in coaching-voice prose. It does not open with charts. Charts appear further down the page, after the client has a frame for what they're looking at.

**Applied in the admin dashboard:**
The coach sees the same data as the client, but with different framing — check-in patterns, behavioral trends, coaching flags. The coach view is designed for decision-making, not for display.

**When building a new feature, ask:** Is this helping a coach coach better, or is it just surfacing more data? If it's the latter, reconsider.

---

### 2. Behavior before outcomes

Physical outcomes — weight, measurements, body composition — lag behind behavioral change by weeks or months. A client who has been consistent for six weeks may not yet have visible results. If the platform only reinforces visible outcomes, it will demotivate exactly the clients who are doing everything right.

Kynovant surfaces behavioral data first: sessions completed, weekly promises kept, consistency streaks. Outcome data (body metrics, weight trend) follows. The sequence communicates the belief that behavior is the real measure of progress.

**Applied in the portal:**
The Behavioral Consistency section appears before body metric charts. The Coaching Milestones system is weighted toward consistency milestones (Four-Week Standard, Twelve-Week Standard) rather than outcome milestones (Lost First 10 Pounds). Outcome milestones exist but are not elevated above process milestones.

**Applied in the Progress page narrative:**
The narrative function in `app/portal/progress/page.tsx` keys on `adherencePct` first. If a client has completed 85%+ of sessions, the narrative leads with that. Body composition delta is a secondary detail, not the headline.

---

### 3. Narrative before metrics

Raw numbers without context can mislead, discourage, or mean nothing at all. A client who sees "23% toward goal" without a frame of reference does not know whether that is good or bad.

Every page that surfaces quantitative data should establish a narrative frame before displaying the data. That frame is the coach's voice — it contextualizes the numbers, sets expectation, and tells the client what to pay attention to.

**Applied in the Progress page:**
The layout order is deliberate: Goal Status Hero → Narrative Summary → Coach Voice → body metric charts. The narrative prose runs before the first chart. By the time a client scrolls to the sparklines, they already know how to interpret what they're seeing.

**Applied in the check-in flow:**
Coach responses appear above the logged metrics in the reviewed check-in view. The interpretation precedes the raw data.

**When building a new feature, ask:** What does the client read before they see a number? If the answer is "nothing," that is a problem.

---

### 4. Coach before charts

The coach is the intelligence layer. Charts are evidence in service of that intelligence. We do not present charts and let clients draw their own conclusions — we present coach interpretation, then support it with evidence.

This means the coach response (Coach Voice) is visually dominant over the charts on the same page. A chart is a subordinate element. It proves a point the coach already made, or it provides context the coach directed the client's attention toward.

**Applied in the Progress page:**
The `CoachVoice` component renders with a left gold accent bar and italic attribution — deliberately styled to stand out from the surrounding data. It appears before body metric sparklines, not after.

**Applied in the architecture:**
We query for and prioritize `coachResponse` from the most recent `reviewed` weekly check-in. If no reviewed response exists, the Coach Voice section does not render at all. We never show a placeholder or a default message in place of the coach's actual words.

---

### 5. AI amplifies coaches, never replaces them

AI in Kynovant exists in one role: to make coaches faster and more consistent, so they can be better coaches to more clients. AI does not make decisions. AI does not speak to clients unsupervised. AI drafts; coaches approve.

The distinction matters because coaching is a relationship. A client who discovers that their "coach response" was generated by AI without review will lose trust — not just in the AI, but in their coach, and in the program. That is an outcome we will not cause.

**Applied in the Progress page (MVP):**
The narrative summary is currently template-driven, computed server-side from behavioral data. It is written in coaching-voice but generated from rules, not AI. When AI drafting is introduced, it will be in a coach-facing drafting tool — the coach reviews, edits, and approves the AI draft before the client sees it.

**Applied in the architecture decision:**
See `ARCHITECTURE_DECISIONS.md` → "AI Drafts, Coach Approves" for the formal decision record.

---

### 6. Coach View and Client View intentionally differ

The coach and the client are looking at the same underlying data, but they are asking different questions.

The client asks: *How am I doing? Am I on track? What should I focus on?*

The coach asks: *Is this client consistent? Are there behavioral flags? What's the trend over the last six weeks? How is this client responding to the program I designed?*

These are not the same question. Building a single view that tries to serve both will serve neither. The coach view should be diagnostic; the client view should be affirming and directive.

**Applied in the architecture:**
Admin routes live under `/app/hq/` and `/app/admin/`. Client routes live under `/app/portal/`. These are not the same components styled differently — they are different data queries, different hierarchies, and different product philosophies applied to the same database.

**Applied in visual design:**
The client portal uses a minimal dark surface with coaching-tone typography. The admin dashboard is denser, more tabular, and designed for scanning across multiple clients. Same brand; different purposes.

---

### 7. Premium through restraint

Cheap software shows everything and lets the user figure out what matters. Premium software makes that decision for the user.

Kynovant earns its premium positioning by deciding what not to show. Every metric we surface should be there because it materially helps the client or coach accomplish something. If a metric is present because "it's interesting" or "we had the data," it is probably the wrong call.

**Applied in the Progress page:**
The page does not show raw check-in history. It does not show every body metric in a table. It selects the most meaningful data — weight trend sparkline, waist trend sparkline, weekly session count — and presents each with a delta indicator and minimal annotation. The suppression of everything else is a deliberate product decision.

**Applied in the milestone system:**
We have 11 milestones. We could have 40. We have 11 because each one is meaningful. "First Check-In," "Four-Week Standard," "First Program Complete," and "100 Promises Kept" are moments a coach would actually celebrate. "Logged 7 workouts in 14 days" is not.

---

### 8. One primary question per page

Every page in Kynovant answers one question. Not two. Not "several related questions." One.

The discipline of enforcing one primary question per page forces the team to decide what the page is actually for before building it. A page that answers multiple questions usually answers none of them well.

**Applied in the portal:**
- **Dashboard:** Where am I right now? (Current Focus + immediate next step)
- **Progress:** How have I been doing? (Trend over time, goal pacing)
- **Check-Ins:** What happened this week? (Week-by-week review)
- **Programs:** What is my program? (Structure and schedule)

**When building a new page, define the question first.** Write it at the top of the spec. If the implementation drifts away from answering that question cleanly, cut scope before shipping.

---

### 9. Every feature should strengthen the coach-client relationship

This is the ultimate filter. Before any feature ships, ask: does this make the coaching relationship stronger, or does it create distance?

Features that strengthen the relationship: surfaces that show clients their coach has reviewed their work; milestones that feel like a coach would celebrate them; a Coach Voice section that reads like a coaching debrief.

Features that create distance: automated messages written in coach voice without coach approval; milestone badges that feel like gamification rather than recognition; surfaces that make the client feel managed by a system rather than guided by a person.

---

### 10. Every page should reduce uncertainty for the client

Clients in a coaching program carry uncertainty: Am I doing enough? Is this working? Should I change something? Am I behind?

Kynovant's job is to reduce that uncertainty — not by promising outcomes, but by answering the question the client has right now. A client who finishes reading the Progress page should feel clearer, not more confused.

**Applied in the Goal Status Hero:**
The hero shows pace status (AHEAD OF PACE / ON PACE / BEHIND) in plain language. It does not show a complex formula. It does not say "your adherence index is 0.87." It says ON PACE and shows 23% toward goal with a target date. Those three data points answer the question "Am I on track?" directly.

---

### 11. Clients should feel coached, not managed

Managed means: you are tracked, logged, and evaluated against a system. Coached means: someone who knows you is guiding your development.

The language, hierarchy, and visual design of the portal are all calibrated toward the "coached" feeling. This is why the Coach Voice section exists before metrics. This is why milestones are named as coaching recognitions, not game achievements. This is why the narrative summary is written in first-person coaching prose, not system-generated copy.

Every piece of copy in the client-facing portal should sound like it could have been written by a thoughtful coach who knows this client — not generated by a system that processes many clients simultaneously.

---

### 12. Recognition before reporting

Before a client is asked to interpret data, they should first understand what they have done well. Recognition precedes evidence.

This principle governs the emotional hierarchy of the Progress page. A client should not have to read through charts and metrics to discover what the data means. They should arrive at the data already oriented — knowing what was accomplished, and reading the evidence as confirmation of something they already feel.

**Applied in the Progress page:**
The Victory Moment renders immediately after the Goal Status Hero and before the Narrative Summary, body metrics, and charts. It states the single strongest positive truth in the client's recent data — in plain language, with no ambiguity. By the time the client reaches the sparklines and consistency charts, they are reading confirmation of something they have already felt.

**Applied in the onboarding state:**
Even on Day 1, the Victory Moment renders — but with an identity anchor rather than a performance recognition: "Your record starts here. Every promise you keep from this point forward becomes part of who you are becoming." Recognition on Day 1 is about who the client is choosing to become, not what they have done yet.

**Applied in difficult weeks:**
Honest recognition does not fabricate success. For clients who had a difficult week, the Victory Moment acknowledges the difficulty and offers direction: "One difficult week does not erase your progress. Your next opportunity to rebuild momentum starts now." This is recognition of resilience and context, not false encouragement.

**The emotional flow this creates:**
Recognition → Meaning → Evidence → Momentum → Celebration

This sequence ensures clients leave the page thinking "I did that — and I want to keep going," not "Here is a report of my recent activity."

---

## How to Use This Document

**When designing a new feature:** Write out which principles it serves and how. If it conflicts with a principle, explain why the exception is justified.

**When reviewing a PR:** Check that the feature does not violate any principles. A feature that tracks more things, surfaces more data, or adds noise in the name of completeness should be challenged.

**When making a tradeoff:** This document is the tiebreaker. Two valid engineering approaches should be evaluated against which one better serves the principles here.

**When onboarding a new engineer:** Read this document before reading any code. The architecture will make more sense once the philosophy is clear.

---

## Document History

| Date | Change |
|------|--------|
| 2026-07-22 | Initial version established |
| 2026-07-23 | Added Principle 12: Recognition before reporting |
