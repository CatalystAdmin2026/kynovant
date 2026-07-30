# Kynovant — Product Language

Established 2026-07-22

---

## What This Document Is

This is the official terminology reference for Kynovant. It defines what we call things in the product — in UI copy, in code, in documentation, in coach-facing tools, and in client-facing surfaces.

Consistent language matters for two reasons:

1. **User trust.** When the same thing is called different names in different parts of the product, clients and coaches notice. It signals that the product was assembled by multiple people who weren't talking to each other.

2. **Code clarity.** When engineers use the same terms in code that coaches use in the field and clients see in the UI, the product becomes easier to build correctly. Naming is alignment.

When in doubt about what to call something, look here first. If it isn't here, define it here before shipping it.

---

## Terms

---

### Goal Anchor

**Definition:** The single primary goal a client is working toward, attached to their active enrollment. In the database: `client_goals` table, `status = 'active'`. In the UI: a short description written by or for the coach that represents the client's stated intent ("Lose 25 lbs before the holidays" / "Build a sustainable fitness routine" / "Improve body composition without losing strength").

**Purpose:** Orients every page that can reference client direction. The Goal Anchor is what the client is working toward — it gives behavioral data (sessions, consistency, check-ins) their meaning.

**When to use it:** In any surface that references the client's primary objective. Progress page: the Goal Status Hero uses the Goal Anchor as its headline. Dashboard: the Current Focus card may reference the active goal. Coach-facing views: displayed alongside client metrics to provide context for behavioral data.

**When not to use it:** Do not use "Goal Anchor" as visible UI copy — it is an internal term. In the UI, say "Your Goal" or show the goal description directly without labeling it. Do not use it to refer to sub-goals, focus areas, or week-level targets — those are different concepts.

---

### Coach Voice

**Definition:** A section in the client portal that surfaces the coach's actual response to the client's most recent reviewed weekly check-in. In the database: the `coachResponse` field on a `weekly_check_ins` row where `status = 'reviewed'`. In the UI: rendered with a left gold accent bar, italic quote style, and attribution ("YOUR COACH · [WEEK LABEL]").

**Purpose:** Makes the coaching relationship tangibly present in the product. The client sees that a specific person read their check-in and responded. Coach Voice is the primary mechanism by which the portal feels coached rather than automated.

**When to use it:** On the Progress page, after the Narrative Summary. Potentially on the Dashboard in a future design. Wherever the most recent coaching communication should appear.

**When not to use it:** Do not use Coach Voice as a section if no actual reviewed coach response exists. The section should not render when `coachVoice` is null — no placeholder, no "Your coach hasn't responded yet," no empty state. The section simply does not appear. Do not use Coach Voice to display AI-generated content that has not been coach-reviewed.

---

### Behavioral Consistency

**Definition:** The aggregate pattern of a client keeping their workout commitments week over week. In the database: derived from `workout_sessions` where `status = 'completed'` vs `status = 'scheduled'` across weeks. In the UI: a reserved section on the Progress page showing current streak, lifetime promises kept, and a session count chart.

**Purpose:** Surfaces the behavioral layer of the client's record before physical outcome data. Behavioral consistency is the leading indicator; body composition is the lagging indicator. By naming this section explicitly, we signal to clients that their consistency is being tracked and valued, not just their results.

**When to use it:** As the label for the section of the Progress page that aggregates session commitment patterns. As the conceptual frame when discussing a client's workout adherence with coaches.

**When not to use it:** Do not show the behavioral stats (streak, lifetime count) until `hasAnyData` is true — a client who has not yet logged any sessions should not see "0 WEEK STREAK · 0 PROMISES KEPT." The section can render with its heading, but the stat row should not appear until real data exists.

---

### Recovery Context

**Definition:** A section on the Progress page (and potentially other surfaces) that provides context about the client's physical load, recovery patterns, or soreness history from weekly check-in data. In the current MVP, this section is structurally present as a reserved zone. Specific metrics (sleep quality, soreness level, energy ratings from check-ins) will populate it in a future sprint.

**Purpose:** Acknowledges that training outcomes depend not just on sessions completed but on recovery quality. A client who completes every session but is chronically under-recovered will plateau or regress. Surfacing recovery context gives the coaching relationship a fuller picture.

**When to use it:** As the reserved section label on the Progress page for recovery-related metrics. In coach-facing views when analyzing client fatigue patterns.

**When not to use it:** Do not manufacture recovery data that doesn't exist. If check-in recovery fields are empty, the section should render its empty state gracefully or not render at all.

---

### Coaching Milestones

**Definition:** Named achievements a client earns by reaching meaningful behavioral or consistency thresholds. In the database: computed from `workout_sessions`, `weekly_check_ins`, and `client_programs` query results. In the UI: rendered in the `AchievementsPanel` component, divided into earned (with gold accent) and locked (dimmed) groups.

**Purpose:** Provide recognition moments that feel earned rather than automated. Coaching Milestones are named for what they mean in a real coaching relationship — "Four-Week Standard" (completing a full month of consistency), "First Promise Kept" (completing the very first session), "First Program Complete" (finishing a full program structure). They create aspiration and track meaningful progress over time.

**Current milestones (as of 2026-07-22):**
- First Check-In (accountability)
- First Promise Kept (milestone)
- 10 Promises Kept (milestone)
- 25 Promises Kept (milestone)
- 50 Promises Kept (milestone)
- 100 Promises Kept (milestone)
- Four-Week Standard (consistency)
- Eight-Week Commitment (consistency)
- Twelve-Week Standard (consistency)
- Three Months In (accountability — 12 check-ins)
- First Program Complete (milestone)

**When to use it:** The term "Coaching Milestones" is used as the section heading on the Progress page. In code, the data type is `Achievement`. In copy, individual milestones may be referred to as "milestones" without the "Coaching" qualifier.

**When not to use it:** Do not call these "achievements," "badges," "trophies," or "awards" in UI copy. These are milestones — they mark a point in the client's journey, not a game reward. Do not add milestones that are not meaningful to a real coaching relationship (e.g., "Logged in 3 days in a row" is a habit app milestone, not a coaching milestone).

---

### Current Focus

**Definition:** The client's immediate priority or next step in their coaching program. In the UI: a section on the Dashboard that surfaces the active program name, current week, today's session (if applicable), and the most immediate action the client should take.

**Purpose:** Reduces the client's cognitive load on the Dashboard. The client should be able to open the portal and immediately know what to do today. Current Focus collapses the full complexity of the program structure into a single actionable view.

**When to use it:** As the primary navigational anchor on the Dashboard. In coach-facing views when describing where a client is in their program.

**When not to use it:** Do not use "Current Focus" to refer to the client's long-term goal. That is the Goal Anchor. Current Focus is tactical (today/this week); Goal Anchor is strategic (the overall objective).

---

### Journey

**Definition:** The client's full arc of engagement with their coaching program — from enrollment through goal achievement. Used to frame progress as a continuous path rather than a series of discrete events or completed items.

**Purpose:** Language that supports the coaching philosophy of "progress over completion." A client is on a journey, not checking boxes. Using "Journey" in section headers and milestone labels reinforces that the relationship is continuous and developmental.

**When to use it:** As an alternative to "History" or "Record" when framing the client's overall arc. In milestone descriptions and narrative summaries when referencing the passage of time ("You've been on this journey for 12 weeks"). In section labels where "progress over time" is the intended meaning.

**When not to use it:** Do not use "Journey" for granular tactical contexts — "Today's Journey" is not a valid use. Do not use it as a substitute for "Program" (a specific structured set of weeks and sessions). Journey is the arc; the program is the vehicle.

---

### Program

**Definition:** A structured coaching plan composed of weeks and days, each day containing one or more prescribed workout sessions. In the database: `program_templates` (the reusable scaffold) and `client_programs` + `client_program_weeks` + `client_program_week_days` (the client-owned copy after assignment). In the UI: the Programs page in the portal, the program management section in the admin dashboard.

**Purpose:** The structural delivery mechanism for coaching. A program takes a coaching philosophy and breaks it into an executable schedule the client can follow.

**When to use it:** When referring to the structured plan a client is following. In navigation labels, page headers, and coach-facing admin tools. In code, prefer `program` over "plan," "schedule," or "course."

**When not to use it:** Do not use "Program" to refer to the client's goal — that is the Goal Anchor. Do not use "Program" to refer to a single session or a single week. A program contains weeks; a week contains days; a day contains sessions.

---

### Coach Guidance

**Definition:** Content authored by the coach that appears at the week or day level of a client's program — notes, instructions, focus reminders, or motivational context for a specific training block. In the database: `coachNotes` fields on `client_program_weeks` and `client_program_week_days`. In the UI: displayed within the program view when the client opens their current week or day.

**Purpose:** The mechanism by which coaches individualize the program experience beyond the structural scaffold. A program template provides the "what"; Coach Guidance provides the "why this week" and "what to pay attention to."

**When to use it:** As the label for coach-authored notes within the program structure. In admin tools where coaches write notes for specific weeks or days.

**When not to use it:** Do not conflate Coach Guidance with Coach Voice. Coach Guidance is attached to program structure (weeks, days). Coach Voice is a response to a weekly check-in. They are different in source, purpose, and surfacing location.

---

### Promises Kept

**Definition:** The count of workout sessions a client has completed (status = 'completed'). Called "Promises Kept" rather than "Sessions Completed" because the language frames consistency as a commitment honored rather than a unit of exercise volume.

**Purpose:** Frames workout completion as integrity — the client made a commitment to their coach and themselves, and they kept it. This framing matters because it reinforces the coaching relationship (the promise exists in the context of a coach-client agreement) and it creates behavioral identity ("I am someone who keeps my promises").

**When to use it:** In the Behavioral Consistency section of the Progress page. In Coaching Milestone labels (10 Promises Kept, 100 Promises Kept). In database fields and code variables: `promisesKept`, `lifetimeKept`.

**When not to use it:** Do not use "Promises Kept" as the label for sessions scheduled but not yet completed — those are upcoming commitments, not kept promises. Do not abbreviate as "Promises" in UI contexts where the meaning might be ambiguous.

---

### Integrity (Future)

**Definition:** A future behavioral identity score representing the percentage of committed sessions a client has followed through on over a defined time window. Part of the planned Behavioral Identity system alongside Reliability and Momentum.

**Purpose:** A quantified signal of whether a client does what they say they'll do, expressed as a coaching-friendly concept rather than an adherence percentage. Integrity > Reliability > Momentum, read together, would give both coaches and clients a multidimensional behavioral identity profile.

**When to use it:** Reserved. Do not build or surface until the Behavioral Identity system is formally specced and approved.

**When not to use it:** Do not use "Integrity" in the current portal. The architectural slot is reserved (the Behavioral Consistency section has a comment block for this), but the feature is not built.

---

### Reliability (Future)

**Definition:** A future behavioral identity score representing consistency of check-in submission and communication patterns. Part of the planned Behavioral Identity system.

**Purpose:** Distinguishes behavioral patterns around communication (checking in, responding) from workout completion (Integrity). A client may be highly reliable (consistent check-ins) but lower integrity (misses sessions), or vice versa. Both patterns carry coaching significance.

**When to use it:** Reserved. Do not build or surface until the Behavioral Identity system is formally specced and approved.

**When not to use it:** Do not use "Reliability" in the current portal.

---

### Momentum (Future)

**Definition:** A future behavioral identity score representing recent trend direction — whether behavioral consistency is improving, steady, or declining over the most recent observation window.

**Purpose:** Captures the directional dimension that Integrity and Reliability miss. A client with 60% Integrity who has improved from 40% over the last 4 weeks has strong Momentum. That context changes how a coach should respond.

**When to use it:** Reserved. Do not build or surface until the Behavioral Identity system is formally specced and approved.

**When not to use it:** Do not use "Momentum" in the current portal.

---

### Victory Moment

**Definition:** A dynamically generated recognition section on the Progress page that surfaces the single strongest positive truth from the client's recent data. In code: produced by `buildVictoryMoment()` in `app/portal/progress/page.tsx`. In the UI: a bordered card with a left accent bar, rendered immediately after the Goal Status Hero and before the Narrative Summary. Accented in emerald (perfect performance), gold (strong progress, resilience, momentum), or neutral (building baseline, difficult week, Day 1).

**Purpose:** Ensures the client feels recognized before they encounter evidence. The Victory Moment answers the question "What did I do well?" before the page presents charts or metrics to prove it. It is the emotional entry point to the Progress page — the moment the client feels seen.

**When to use it:** Once, near the top of the Progress page, after the Goal Status Hero. Never on other pages. Never as a persistent banner. It is specific to the weekly progress review context.

**When not to use it:** Do not use the Victory Moment to fabricate success when the data does not support it. When a client had a difficult week (low adherence, missed sessions), the Victory Moment acknowledges context and offers direction — it does not pretend the week went well. Do not use the Victory Moment as a generic motivational quote or a static message — it must be computed from the client's actual data. Never leave the Victory Moment empty; every state (including Day 1) has a valid message.

**Copy constraints:** The headline must be a complete sentence that could have been written by a thoughtful coach. The subtext provides the evidence behind the headline — specific, data-grounded, never vague. Both must read as something a person said, not something a system generated.

---

### Goal Distance

**Definition:** The quantified measure of how far a client has moved toward their numeric goal target, and how far remains. In code: `GoalDistance` type in `lib/db/portal-dashboard-service.ts`, computed by `computeGoalDistance()`. In the UI: displayed beneath the progress bar in the Goal Status Hero as two values: `[X units completed] · [Y units remaining]`.

**Purpose:** Translates a percentage into tangible, human-scale distance. "31% toward goal" is abstract. "6.6 lbs completed · 13.2 lbs remaining" is concrete. The client can feel the distance remaining in the same units they think about their goal in.

**Format:** `[completed value] [unit] [verb] · [remaining value] [unit] remaining`. The verb adapts to the goal direction:
- Reducing (fat loss, waist reduction): "completed" for lbs, "reduced" for inches
- Gaining (muscle gain, weight gain): "added" for lbs

**When to use it:** Only when the goal has a numeric target, a compatible measurement unit (lbs or inches), and at least 2 data points to compute start and current values. All three conditions must be true.

**When not to use it:** Goals without a numeric target (general health, strength, athletic performance, mobility) do not receive a Goal Distance — they receive a `qualitativeState` instead (e.g., "Building your baseline", "Progress measured through what you lift"). Do not show "0 lbs completed · 25 lbs remaining" on Day 1 before any check-ins — insufficient data means Goal Distance is null. The absence of Goal Distance should feel intentional, not broken; the qualitative state ensures the goal still feels contextualised.

**Coach responsibility:** Coaches are responsible for defining numeric targets on goals where measurable distance matters (fat loss, muscle gain). Without a target, Goal Distance cannot be computed. This is documented in code comments at the computation site.

---

### Newly Earned Milestone

**Definition:** A Coaching Milestone that has transitioned from locked to earned since the client last viewed the Milestones section. In code: determined at mount time by comparing earned milestone IDs against `localStorage.getItem('kynovant_milestones_seen')`. In the UI: triggers a one-time CSS animation (`milestone-unlock` keyframe) — a restrained gold glow and brief scale — before settling into the permanent earned state.

**Purpose:** Gives the milestone unlock moment the weight it deserves. Earning "Four-Week Standard" after four consecutive weeks of training is a genuine coaching moment. The animation is the system's acknowledgement of that moment — seen once, never repeated.

**When to use it:** As the label for the animated state of a Coaching Milestone on its first appearance after being earned. "Newly earned" is a transient state — it exists only until the animation completes and the milestone ID is written to `localStorage`.

**When not to use it:** Do not animate every earned milestone on every page load — only those not yet acknowledged in `localStorage`. Do not use this pattern outside the Milestones section. Do not apply arcade-style animations, confetti, or sound effects. The animation is a quiet nod from the system — not a celebration that demands the client's full attention.

**Persistence mechanism:** Client-side `localStorage` keyed by `kynovant_milestones_seen`. See `ARCHITECTURE_DECISIONS.md` → ADR-010 for the tradeoff discussion.

---

## Terms to Avoid

These terms are in common use in fitness apps and should be avoided in Kynovant to maintain distinction:

| Avoid | Use Instead | Reason |
|-------|-------------|--------|
| Achievements | Coaching Milestones | "Achievements" implies gamification |
| Badges | Milestones | Same reason |
| Trophies | Milestones | Same reason |
| Streak | Week Streak (with unit) | Bare "streak" is ambiguous |
| Stats | Metrics or (section-specific name) | Too generic |
| Dashboard widgets | Sections or cards | Dashboard widget is an implementation term |
| Completed | Kept (for sessions) | "Kept" preserves the promise framing |
| User | Client or Coach | "User" erases the coaching relationship context |

---

## Document History

| Date | Change |
|------|--------|
| 2026-07-22 | Initial version established |
| 2026-07-23 | Added Victory Moment, Goal Distance, Newly Earned Milestone |
