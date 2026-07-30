# Kynovant — Architecture Decision Record

Established 2026-07-22

---

## What This Document Is

This is a living record of significant architectural decisions made during the development of Kynovant. Each entry documents the decision itself, why it was chosen, what alternatives were considered, the tradeoffs accepted, and the long-term benefits expected.

New decisions should be appended in chronological order. Decisions are not removed when superseded — they are marked as superseded and a new entry explains the change and the reason for it.

---

## ADR Format

Each entry follows this structure:

```
### [ID] Title
Status: Active | Superseded by [ID] | Deprecated
Date: YYYY-MM-DD

Decision
Why
Alternatives Considered
Tradeoffs
Long-term Benefits
```

---

## Decisions

---

### ADR-001 — Copy-on-Assignment Architecture for Client Programs

**Status:** Active
**Date:** 2026-07-11

#### Decision

When a coach assigns a program template to a client, the system deep-copies the template's `program_weeks` and `program_week_days` rows into `client_program_weeks` and `client_program_week_days`, creating a fully independent structural clone. The client's program is immediately decoupled from the template at the moment of assignment.

`workout_templates` (the leaf-level exercise prescriptions) are **not** copied — they remain shared references. Only the structural scaffold (weeks and days) is cloned.

`sourceTemplateName` and `sourceTemplateVersion` are snapshotted onto `client_programs` at assignment time to preserve provenance.

#### Why

A coaching program is a contract between a coach and a client. If the coach later revises the template for future clients, that revision should not retroactively alter the program a current client is mid-way through. The client's copy must be stable from assignment onward.

This also allows coaches to customize a client's program after assignment — adding days, modifying structure — without those changes propagating back to the template or forward to other clients on the same template.

#### Alternatives Considered

**Live reference to template:** The simplest approach. Client always sees the current state of the template. Rejected because any template edit — even a typo fix — would modify in-progress client programs. A client's "Week 3, Day 2" could change beneath them mid-program.

**Snapshot at week boundary:** Deep-copy the template one week at a time as the client progresses. Adds complexity without clear benefit. Clients would see different versions of their own program across weeks if the template was edited mid-assignment.

**Full deep copy including workout_templates:** Clone everything down to exercise prescriptions. Rejected because it creates massive data duplication for no functional benefit — workout templates are stable reference data, not program structure.

#### Tradeoffs

- Storage: each assignment creates N new rows (one per week, one per day). This is a deliberate tradeoff for stability.
- A bug fix to a shared `workout_template` (e.g., correcting an exercise description) propagates to all clients, including those mid-program. This is acceptable because `workout_templates` are reference data, not program structure.
- Assignment process is more complex than a simple FK insert. The assignment function must query template structure and insert client rows transactionally.

#### Long-term Benefits

- Audit trail: `sourceTemplateName` + `sourceTemplateVersion` on `client_programs` allows future reporting ("how many clients completed the 12-Week Foundation v2 template?").
- Per-client customization: coaches can modify a client's program weeks/days without affecting any other client or the base template.
- Historical accuracy: completed programs reflect exactly the structure the client actually followed, not what the template looks like today.

---

### ADR-002 — Snapshotting sourceTemplateName and sourceTemplateVersion

**Status:** Active
**Date:** 2026-07-11

#### Decision

At assignment time, `client_programs.sourceTemplateName` and `client_programs.sourceTemplateVersion` are written with the current values from the source `program_templates` row. These fields are never updated after assignment.

#### Why

Templates evolve. A coach may rename a template, publish a v2, or archive the v1. Once a client is assigned, the identity of the template they were assigned matters for reporting, coaching review, and future AI analysis. Storing the name and version at assignment time preserves that identity independently of any future template changes.

#### Alternatives Considered

**FK to program_templates only:** Query template name when needed. Rejected because templates can be deleted, renamed, or archived — the historical name would be lost.

**Separate assignments audit table:** Log every assignment with a full template snapshot. Over-engineered for the current need; a name/version capture on the assignment row is sufficient.

#### Tradeoffs

- Name and version can drift from the current template name if the template is heavily revised. This is intentional — the snapshot reflects what was assigned, not what the template is called today.
- Version is a string (e.g. "v1", "2.0") rather than an integer. This is flexible but not formally enforced.

#### Long-term Benefits

- Enables cohort analysis: "all clients who completed v1 of the 12-Week Foundation program."
- Allows future AI coaching features to condition on which template a client ran.
- Provides a human-readable audit trail without requiring a JOIN to a potentially-deleted template row.

---

### ADR-003 — Coach View and Client View as Separate Routes and Components

**Status:** Active
**Date:** 2026-07-11

#### Decision

Admin and coach-facing pages live under `/app/hq/` and `/app/admin/`. Client-facing pages live under `/app/portal/`. These are not shared components styled differently — they are distinct data-fetching layers, distinct layouts, and distinct product philosophies applied to the same database.

Role enforcement is applied at the route level: `requireClientUser()` redirects non-clients, `requireAdminUser()` redirects non-admins.

#### Why

The coach and the client have fundamentally different needs when looking at the same data. A single shared view that tries to serve both would optimize for neither. The coach view is diagnostic and dense; the client view is affirming and directive. Attempting to unify them would require so many conditional branches and visibility toggles that the codebase would become difficult to reason about and the UX would be compromised in both directions.

Separate routes also enable independent evolution: the client portal can be redesigned without touching admin tooling, and vice versa.

#### Alternatives Considered

**Single route with role-conditional rendering:** One set of components, toggling between admin and client views based on session role. Rejected because role-conditional JSX proliferates throughout the component tree and makes each component responsible for two design philosophies simultaneously.

**Shared data layer, separate presentation:** Share server-side queries but use different UI components. This is essentially what we do, except the queries are also different because the two views prioritize different aspects of the data.

#### Tradeoffs

- Some data-fetching logic is duplicated across portal and admin services. This is acceptable because the queries are shaped differently for each audience.
- Two surfaces to maintain when schema changes. Mitigated by the fact that the service layer (`lib/db/`) is shared even when routes are separate.

#### Long-term Benefits

- Each surface can evolve independently at its own pace.
- New engineers can reason about one surface without needing to understand the other.
- Role-based access is enforced at the route boundary, not scattered throughout components.
- AI features can be introduced in the coach view (where they draft) before surfacing in the client view (where they appear reviewed).

---

### ADR-004 — AI Drafts, Coach Approves

**Status:** Active (MVP: template-driven, not yet AI-powered)
**Date:** 2026-07-22

#### Decision

Any AI-generated content that will be surfaced to a client must first be reviewed and approved by a coach. AI is used to produce drafts — narratives, check-in responses, milestone summaries — which are presented to the coach for editing and approval before they appear in any client-facing view.

AI-generated content is never displayed to clients in real time or without human review. There are no exceptions to this rule in client-facing views.

#### Why

Coaching is a trust relationship. A client who discovers that the "coaching voice" speaking to them is generated by AI without any coach review will lose trust — not just in the AI, but in their coach and in the program. The cost of one trust-breaking incident outweighs the efficiency gain of unsupervised AI output.

Additionally, AI models make errors. They may misinterpret trends, fabricate positive framing that contradicts the data, or use language inconsistent with the coach's established voice with this client. Human review catches these errors before they reach the client.

#### Current State

In the MVP, "AI-drafted" content is actually template-driven server-side computation. The narrative summary on the Progress page is generated by `buildNarrativeSummary()` in `app/portal/progress/page.tsx` — a deterministic function that produces coaching-voice prose from behavioral data. No LLM is involved yet.

This is intentional. The template-driven phase establishes the content hierarchy and UX flow before LLM involvement. When AI drafting is introduced, the experience it slots into already exists.

#### Future State

When AI drafting is introduced:
1. A coach-facing drafting tool generates a proposed narrative from the client's data.
2. The coach reviews, edits, and explicitly approves the draft.
3. The approved text is stored (with approval metadata) and surfaced to the client.
4. The client sees coaching voice that a coach has reviewed. The AI's role is invisible to the client.

#### Alternatives Considered

**Real-time AI generation in client view:** AI generates narrative summaries on page load, displayed immediately. Rejected. No coach review is possible. Errors reach clients unchecked. Trust risk is unacceptable.

**AI generation with opt-out review:** AI generates by default; coaches can review if they want. Rejected. "Optional review" becomes "no review" at scale. The guarantee must be structural, not reliant on coach discipline.

**No AI, manual coach drafting only:** Coaches write all narratives manually. Keeps humans in the loop, but doesn't scale. Coaches with 30 clients cannot write weekly narrative summaries for each. AI drafting with required approval is the right middle ground.

#### Tradeoffs

- More complex workflow than real-time AI. A coach must take an action before the client sees updated content.
- Client content may lag behind the most recent data until a coach approves a new draft.
- Requires building a coach-facing approval UI before the AI feature fully ships.

#### Long-term Benefits

- Structural guarantee that coaching voice represents a human decision, not a model prediction.
- AI can be improved or swapped without changing the client experience.
- Approval metadata creates an audit trail: which coach approved which narrative, on what date.
- Coaches become collaborators with the AI rather than being replaced by it.

---

### ADR-005 — Goal-Type-Aware Progress Pacing

**Status:** Active
**Date:** 2026-07-22

#### Decision

The goal pacing engine (`computeGoalProgressInMemory()` in `lib/db/portal-dashboard-service.ts`) only computes a percentage-toward-goal and pace status (ahead/on_pace/behind) for goals where:

1. The goal type involves body weight (fat_loss, body_recomposition, maintenance, muscle_gain, custom)
2. The target unit contains "lb" or "pound"
3. A numeric `targetValue` is set
4. At least 2 body weight measurements exist in the check-in history

All other goals return `paceStatus: "in_progress"` and `percentComplete: null`.

#### Why

Pacing calculations require a measurable start point, a measurable current point, and a measurable target. Many coaching goals do not satisfy these conditions:

- "Improve overall fitness" has no numeric target.
- "Build a sustainable routine" cannot be measured in a linear unit.
- A strength goal measured in max lifts cannot be easily read from weekly check-in body metrics.

Fabricating a progress percentage for unmeasurable goals would be dishonest — it would show a number that looks authoritative but is actually meaningless. This violates the principle "Never fabricate progress" (see `AI_PRINCIPLES.md`).

Weight-based goals (measured in lbs) are the one goal type where we have reliable, automatically-collected measurements (from weekly check-ins) and a clear linear target, making pacing honest and useful.

#### Alternatives Considered

**Progress percentage for all goals:** Derive percentage from time elapsed alone ("You've been in the program 3 months; your goal window is 6 months, so 50%"). Rejected because time-elapsed progress is not goal progress — a client who has been consistent for 3 months but made no measurable change is not "50% of the way to their goal."

**Block goal hero unless all conditions are met:** Only show the Goal Status Hero if we can compute pacing. Rejected because the goal description and target date are still useful to the client even when pacing cannot be computed. The hero renders; the pace chip and percentage simply do not appear.

**Allow coaches to manually set progress percentage:** Coach overrides the calculated progress. Possible future state, but not MVP. Manual override is coach-facing work that belongs in the admin dashboard.

#### Tradeoffs

- Many clients in the system will see "IN PROGRESS" rather than a pace status. This is honest but less informative.
- Goal types that coaches and clients care about (e.g., strength, endurance) cannot produce a pace status until we have structured measurement data for those dimensions.

#### Long-term Benefits

- Progress percentages shown to clients are always grounded in real data.
- The architecture is extensible: adding pacing for strength goals requires adding a measurement source (e.g., max lift tracking) and a branch in the pacing function, not a redesign.
- Sets a precedent that "unknown" is displayed as "unknown" rather than being papered over with a plausible-looking number.

---

### ADR-006 — Narrative-First Progress Page

**Status:** Active
**Date:** 2026-07-22

#### Decision

The Progress page renders content in this fixed order:
1. Goal Status Hero (conditional on goal existing)
2. Narrative Summary (always present)
3. Coach Voice (conditional on reviewed coach response existing)
4. Body Metrics (weight sparkline, waist sparkline)
5. Behavioral Consistency (reserved zone, stats gated on `hasAnyData`)
6. Recovery Context
7. Coaching Milestones

Charts and raw data appear below the fold, after interpretive content.

#### Why

The client's first question when opening the Progress page is not "What is my weight trend?" It is "How am I doing?" Answering that question requires interpretation, not data. The Goal Status Hero and Narrative Summary answer "How am I doing?" in plain language. By the time the client reaches the charts, they already have a frame for what they're looking at.

Without this ordering, a client who has lost 6 lbs but sees a downward-sloping sparkline before reading any context may misread the direction of the line and feel confused or discouraged. Context-first prevents that misread.

#### Alternatives Considered

**Charts first, narrative below:** Standard dashboard pattern. Rejected. Prioritizes data presentation over coaching communication. Optimizes for engineers building it rather than clients using it.

**No narrative, data only:** Clean, minimal, "lets the data speak." Rejected. Data doesn't speak — coaches speak. A page of charts without a frame is not coaching, it is tracking. See philosophy principle "Coach before charts."

**Narrative generated per-section inline:** Each chart section has a micro-narrative directly above it. Considered for a future state. For MVP, a single cohesive narrative near the top is cleaner.

#### Tradeoffs

- Narrative paragraph is always present, even when minimal ("The record begins here."). The empty-state narrative must be written carefully to not feel awkward.
- Page length increases because interpretive content precedes data content. This is acceptable and probably beneficial — clients who read the narrative before scrolling to charts are better oriented.

#### Long-term Benefits

- Establishes the right mental model: Progress is a coaching report, not a data dashboard.
- Narrative section can eventually be AI-drafted and coach-approved without changing the page structure.
- Clients habituate to reading interpretation before looking at charts, which reduces misreads.

---

### ADR-007 — Client-Owned Program Structures

**Status:** Active
**Date:** 2026-07-11

#### Decision

Once a program template is assigned to a client, the client's program structure (weeks and days) is fully owned by the client record, not the template. Coaches can modify the client's copy — add days, restructure weeks, adjust targets — without those changes touching the base template or any other client's program.

See ADR-001 for the copy-on-assignment implementation.

This decision extends beyond the copy: the client program record is the source of truth for what that client is doing. The template is only relevant at assignment time and for provenance metadata.

#### Why

Every client is different. A 12-week program may be the right scaffold for most clients, but week 7 may need an extra recovery day for a client coming back from illness, or a coach may want to extend a client to week 14 based on progress. These customizations are normal coaching practice and must be possible without touching the shared template.

If the template were the source of truth, customizations would either pollute the template (affecting all future assignments) or require a forking mechanism that adds complexity without the clean isolation that copy-on-assignment provides.

#### Tradeoffs

- Coach modifications to a client's program are only visible on that client's record. If the coach wants to apply the same change to all future clients, they must also update the base template.
- Storage increases proportionally with the number of active clients.

#### Long-term Benefits

- Coaches can provide truly individualized program adjustments.
- Client program history is stable and auditable.
- Future AI features can analyze what program modifications coaches make and suggest improvements to base templates.

---

### ADR-008 — Deterministic Victory Moment (Rule-Based Emotional Interpretation)

**Status:** Active
**Date:** 2026-07-23

#### Decision

The Victory Moment on the Progress page is generated by a deterministic, rule-based function (`buildVictoryMoment()` in `app/portal/progress/page.tsx`) that evaluates the client's behavioral data and selects the single strongest valid recognition message. No LLM is involved. The function is pure — it takes data in and returns `{ headline, subtext, accent }` with no side effects.

Priority order evaluated in sequence:
1. Perfect adherence last week (100%, ≥2 sessions)
2. Two or more consecutive perfect weeks
3. Meaningful physical progress (≥3 lbs) while adherence ≥75%
4. Resilience: high stress (≥7/10) but adherence ≥70%
5. Multi-week streak (≥4 consecutive weeks)
6. General positive adherence (≥60% recent)
7. Difficult week (last week <50% completion with sessions scheduled)
8. Has some session data (baseline recognition)
9. Has check-in data but no sessions (building baseline)
10. Day 1 fallback (identity anchor)

#### Why

The Victory Moment is the emotional entry point to the Progress page. It must be trustworthy — a client who reads "You kept every promise you made to yourself this week" must be able to verify that claim by scrolling down. If the statement is fabricated or miscalculated, the entire page loses credibility.

A deterministic rule-based function provides this guarantee. Every message is grounded in a specific, verifiable data condition. The priority order ensures the strongest truth surfaces first.

#### Alternatives Considered

**LLM generation (real-time):** AI generates a Victory Moment from client data on page load. Rejected because: (1) violates the "AI drafts, coach approves" principle — client-facing content requires human review before display; (2) real-time generation adds latency and cost on a page that should load fast; (3) risk of fabricated positive framing that contradicts actual data.

**Coach-authored Victory Moment:** Coach manually writes the weekly recognition message. Correct philosophically but does not scale. Reserve for a future enhancement where the AI drafts and the coach approves the Victory Moment as part of their weekly review workflow.

**No Victory Moment:** Page opens directly with the goal hero and narrative. Rejected because it presents evidence before recognition — the client must read through data to discover what it means rather than being oriented before encountering it.

#### Tradeoffs

- Rule-based messages follow patterns, not natural language. A coach would phrase things differently for different clients. This is the MVP tradeoff — template language in coaching voice is better than no recognition at all.
- The priority order is opinionated. A client who had perfect adherence AND just hit a milestone gets the adherence message, not the milestone message. The milestone is recognized separately through the unlock animation.

#### Long-term Benefits

- Establishes the content hierarchy and UX slot before AI is introduced. When AI drafting ships, the Victory Moment section exists and the coach approval flow slots in without redesign.
- Rule-based logic is auditable — every message can be traced to an exact data condition.
- Sets a codebase precedent: emotional interpretation is server-side, deterministic, and never fabricated.

---

### ADR-009 — Generic Quantitative Goal Distance

**Status:** Active
**Date:** 2026-07-23

#### Decision

For goals with a numeric start value, current value, and target value in a compatible unit (lbs or inches), the service layer computes a `GoalDistance` object: `{ completedValue, remainingValue, unit, completedLabel, remainingLabel }`. Direction (reducing vs. gaining) is inferred by comparing target to start. Labels adapt their verb to direction and unit.

Goals without numeric targets, without sufficient measurement data, or using incompatible units return `distance: null` and instead receive a `qualitativeState` string that describes progress in human terms ("Building your baseline", "Progress measured through what you lift").

Both `GoalDistance` and `qualitativeState` are computed inside `computeGoalProgressInMemory()` in the service layer — no UI component performs this logic.

#### Why

A percentage alone is abstract. "31% toward goal" requires the client to do mental arithmetic to understand what it means in real terms. "6.6 lbs completed · 13.2 lbs remaining" is immediately legible — they can feel the distance in units that match how they think about their goal.

Non-numeric goals should not receive a forced "0 / unknown remaining" state — that reads as broken. A qualitative state that accurately describes what progress means for that goal type is more honest and more coaching-appropriate.

#### Alternatives Considered

**Hardcode weight-loss direction only:** Show distance only for fat_loss goals. Rejected because the computation generalizes cleanly: if target < start → reducing, if target > start → gaining. Supporting muscle gain and waist reduction costs nothing and handles real client goals correctly.

**Display distance in the UI without service layer computation:** UI component infers direction and computes values from raw goal data. Rejected because this spreads business logic into presentation components, making it harder to test, audit, or eventually replace with AI-enhanced descriptions.

**Always show a progress number even without a target:** Use time elapsed as a proxy for progress. Rejected. See ADR-005 — we do not fabricate meaningful-looking numbers for unmeasurable goals.

#### Tradeoffs

- Currently limited to lbs and inches. Goals measured in kg, cm, or other units return `null` until unit normalization is added to the schema.
- Coach is responsible for setting a numeric `targetValue` when a meaningful distance calculation matters. Without it, `GoalDistance` is always null. This is documented in the code and in `PRODUCT_LANGUAGE.md`.

#### Long-term Benefits

- Distance computation is isolated in the service layer — UI components receive plain data and render it without knowing the calculation.
- Qualitative state for non-numeric goals is extensible: new goal types get a message by adding a case to `deriveQualitativeState()`.
- Sets up the right data shape for eventual AI enhancement: an AI-authored description of goal distance would slot into the same field with the same rendering logic.

---

### ADR-010 — DB-Backed Milestone Unlock Acknowledgement

**Status:** Active (supersedes original localStorage approach from 2026-07-23)
**Date:** 2026-07-23

#### Decision

The one-time milestone unlock animation tracks acknowledgement in the `client_milestone_acknowledgements` DB table, keyed by `(client_id, milestone_key)`. The server computes `newlyEarned = earned − acknowledged` inside `getDashboardData()` and passes the result as a `newlyEarnedMilestoneKeys: string[]` prop to `AchievementsPanel`. After the 1.5s animation completes, the component calls `POST /api/milestones/acknowledge` with the newly-earned keys. Future page loads — on any device or browser — find those keys already in the DB and pass an empty `newlyEarnedMilestoneKeys`, suppressing the animation permanently.

#### Why

Milestone acknowledgement is coaching data, not browser state. A client who opens the portal on their phone after seeing an animation on desktop should not see it again. A client who clears their browser cache should not see all animations replay. A future native mobile app has no localStorage at all.

The localStorage approach placed the authority for "has this client seen this animation" in the browser. That is the wrong location for any data the product makes a guarantee about. Moving it to the DB restores that authority to the server.

The implementation cost is low: one additive schema migration, one API route (~30 lines), one service query added to an existing `Promise.all`, and a prop change threading through two components. This is not 10x complexity — it is straightforwardly correct.

#### Alternatives Considered

**localStorage (original MVP approach):** Rejected for the reasons above. Browser-scoped, device-scoped, not user-namespaced (shared browsers could cross-contaminate), and incompatible with native mobile. Acceptable as a day-one temporary measure; not acceptable as a permanent architecture.

**Cookie-based persistence:** Same browser-scoping problem as localStorage, with additional HTTP overhead on every request. No benefit for this use case.

**Session-only suppression (no persistence):** Suppress animation on subsequent renders within the same session. Does not survive page reloads. Explicitly prohibited by the spec.

#### Tradeoffs

- Adds one DB query to `getDashboardData()` (indexed on `client_id`, sub-millisecond cost).
- Adds one API call per page view where newly-earned milestones exist (rare — only on the load immediately after earning a milestone).
- On first deploy after migration, all existing clients will see animations for all currently-earned milestones — the table starts empty. This is intentional and acceptable: clients see each milestone animation exactly once, which is the correct behavior. The moment is genuine even if delayed.
- If the API call fails (network error), `acknowledged.current` is reset to `false` and the animation may replay on the next page load. Acceptable failure mode — better to replay once than to silently drop acknowledgement.

#### Long-term Benefits

- Acknowledgement is now queryable: analytics on milestone unlock rates, time-to-earn per milestone, and cohort unlock patterns are all available from the same table.
- Works identically for future native mobile apps and any other client surface.
- The server has authority over what the client renders — a cleaner data flow than client-side state determining which UI elements animate.
- Establishes the correct pattern: coaching data lives in the DB; transient UI state (e.g., tooltip dismissed, accordion open) may live in localStorage; data the product makes behavioral guarantees about belongs in the DB.

---

### ADR-011 — Notification Architecture: DB-Backed Event Log

**Status:** Active (delivery channels not yet implemented)
**Date:** 2026-07-23

#### Decision

Coaching events that clients should be aware of are recorded in a `client_notifications` table (`schema-notifications.ts`). Each row captures: who was notified, who triggered the event, the event type, the resource it refers to, a human-readable title and body, and a `readAt` timestamp (null = unread).

Five event types are defined:
- `check_in_reviewed` — coach has reviewed and responded to a check-in
- `coach_responded` — reserved for future direct-message flow
- `program_updated` — coach has modified the client's active program
- `nutrition_updated` — coach has updated nutrition targets
- `milestone_earned` — client has earned a coaching milestone

The first live event is `check_in_reviewed`, emitted by `markCheckInReviewed()` in `coach-check-in-service.ts` immediately after a successful review transaction.

No delivery channel (email, push, in-app badge) is implemented. The infrastructure layer is complete; delivery is a future concern.

#### Why

The check-in audit identified the absence of a notification loop as a critical gap: clients submit a check-in and have no way to know when their coach has responded without manually checking the portal. This blocks the core feedback loop of the coaching relationship.

The decision to build the DB layer before any delivery UI follows the same pattern established for AI readiness: establish the right data shape early so delivery integrations can be added without schema changes. A notification that exists in the DB can be delivered via email, push, or in-app badge by reading the same table — no re-architecture required.

#### Alternatives Considered

**Build the full notification pipeline now (table + email + UI):** Premature. Email delivery requires a transactional email provider integration (Resend, Postmark), an in-app notification surface requires UI work, and push notifications require a service worker. None of these are single-sprint items. The DB layer is a well-defined, low-risk foundation.

**Skip the DB layer and send email directly from the service:** Couples delivery logic into service functions, makes retries hard, provides no audit trail, and cannot serve a future in-app notification surface. Rejected.

**Use a third-party notification service (Knock, Novu) from day one:** Adds external dependency and per-notification cost before we have any delivery volume. Better to own the event record and integrate delivery services on top.

#### Tradeoffs

- Notifications accumulate in the DB indefinitely until read. A future cleanup job or TTL policy will be needed at scale.
- No delivery means clients currently cannot benefit from the notification infrastructure until the delivery layer ships. This is intentional — correctness before features.
- `createNotification` is called outside the `markCheckInReviewed` transaction. A notification write failure will not roll back the review (desired behavior), but the notification may be silently lost on failure. A future retry mechanism would address this.

#### Long-term Benefits

- The `readAt` column enables unread counts, badge indicators, and in-app notification surfaces with no schema changes.
- `resourceType + resourceId` enable deep-linking from any notification to the specific check-in, program, or milestone it refers to.
- The event log doubles as an analytics source: time-to-response, notification open rates, and engagement patterns are all derivable from this table.
- Adding a new notification type requires only: (a) adding a value to the `notification_event_type` enum via migration, and (b) calling `createNotification` from the relevant service function.

---

## Appending New Decisions

When a new architectural decision is made, add an entry at the bottom of this document following the format above. Assign the next sequential ADR number. Update the document history table.

Decisions should be documented when:
- A non-obvious design choice is made that future engineers might question
- An alternative approach was seriously considered and rejected
- A tradeoff was consciously accepted
- A pattern is established that other features will follow

---

## Document History

| Date | Change |
|------|--------|
| 2026-07-22 | Initial version — ADR-001 through ADR-007 established |
| 2026-07-23 | Added ADR-008 (Victory Moment), ADR-009 (Goal Distance), ADR-010 (localStorage milestone acknowledgement) |
| 2026-07-23 | ADR-010 superseded: replaced localStorage with DB-backed acknowledgement table (`client_milestone_acknowledgements`) |
| 2026-07-23 | Added ADR-011 (Notification Architecture): DB-backed event log, `check_in_reviewed` notification wired; delivery channels deferred |
