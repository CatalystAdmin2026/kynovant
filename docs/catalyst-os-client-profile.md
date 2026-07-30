# Kynovant — Client Profile & Onboarding Data Foundation

Sprint 5B.3 · July 2026

---

## Overview

This document describes the structured client onboarding and coaching-profile data model introduced in Sprint 5B.3. It covers the source-of-truth strategy, schema relationships, sensitive-data rules, profile-readiness calculation, and future integration paths.

---

## Onboarding Source-of-Truth Strategy

### Two-layer model

| Layer | Table | Purpose |
|---|---|---|
| Raw | `onboarding_submissions` | Immutable archive of every submission as received |
| Structured | Domain tables (health_profiles, client_goals, etc.) | Current best-known structured profile, populated by processing submissions |

**Rule:** Never modify `onboarding_submissions` rows after insertion. They are the single historical record. Structured tables represent the current understanding derived from one or more submissions.

### Submission lifecycle

```
Form submitted (Google Sheets / portal)
  → INSERT onboarding_submissions (status = received)
  → Processing job parses rawPayload
  → Upsert domain tables (health_profiles, client_goals, etc.)
  → UPDATE onboarding_submissions SET status = processed, processedAt = now()
```

If processing fails: `status = failed`, `processingError` stores a safe internal message (never surfaced to clients).

If a client re-submits an update form: the old submission stays intact (status = `superseded` if replaced by a newer one), and the new submission drives a domain-table upsert.

---

## Schema Relationships

### New tables (Sprint 5B.3)

```
users ─┬──> onboarding_submissions (1:many, append-only)
       ├──> health_profiles        (1:1, PK = client_id)
       ├──> client_goals           (1:many)
       ├──> injuries_limitations   (1:many)
       ├──> training_profiles      (1:1, PK = client_id)
       ├──> equipment_access       (1:many)
       ├──> nutrition_profiles     (1:1, PK = client_id)
       ├──> body_composition_records (1:many, append-only)
       ├──> executive_health_profiles (1:1, PK = client_id)
       └──> client_preferences     (1:1, PK = client_id)

coaching_enrollments ─┬──> onboarding_submissions (1:many, SET NULL on delete)
                      ├──> client_goals           (1:many, SET NULL on delete)
                      └──> executive_health_profiles (1:many, SET NULL on delete)

onboarding_submissions ──> health_profiles (1:1 link back, SET NULL on delete)
```

### Foreign key behavior

| FK | On Delete |
|---|---|
| Most `client_id → users.id` | RESTRICT — records must not be silently lost |
| `enrollment_id → coaching_enrollments.id` | SET NULL — records survive enrollment end |
| `health_profiles.onboarding_submission_id` | SET NULL — health profile persists if submission archived |

**No ON DELETE CASCADE** in this sprint. Any future cascade must be explicitly justified and reviewed.

### One-per-client tables (PK = client_id)

`health_profiles`, `training_profiles`, `nutrition_profiles`, `executive_health_profiles`, `client_preferences` use `client_id` as the primary key. This enforces exactly one active structured profile per client per domain. Updates are in-place upserts on the PK.

### Append-only tables

`onboarding_submissions` and `body_composition_records` are append-only. Never issue UPDATE or DELETE against these tables in application code. Historical integrity is non-negotiable.

---

## Sensitive Data Classification

### Highly sensitive — server-only, no client RLS

| Table | Reason |
|---|---|
| `onboarding_submissions.rawPayload` | Contains all fields collected, including medical and personal |
| `health_profiles` | Diagnosed conditions, medications, surgical history, physician restrictions, pregnancy status |
| `injuries_limitations` | Mixed client-facing and coach-only data (`coachNotes`); column-level RLS not available |
| `executive_health_profiles` | Biomarker summaries, physician clearance, hormone protocol details |

These tables have RLS enabled but **no client SELECT policy**. Drizzle (direct Postgres) bypasses RLS on the server. Client-facing helpers that query these tables must never forward the results to browser or Client Components.

### Client-readable — SELECT own rows only

| Table | RLS Policy |
|---|---|
| `client_goals` | `auth.uid() = client_id` |
| `training_profiles` | `auth.uid() = client_id` |
| `equipment_access` | `auth.uid() = client_id` |
| `nutrition_profiles` | `auth.uid() = client_id` |
| `body_composition_records` | `auth.uid() = client_id` |
| `client_preferences` | `auth.uid() = client_id` |

No INSERT, UPDATE, or DELETE policies exist in this sprint. Browser clients cannot modify profile data.

### Coach-visible (not yet implemented)

Coach access policies will be added in a future sprint. For now, coaches use server-side admin access only.

---

## Profile Readiness Calculation

`lib/db/profile-readiness.ts` — `calculateProfileReadiness(clientId)`

### Sections

| Section | Table(s) queried | Complete when |
|---|---|---|
| identity | onboarding_submissions | Any submission exists |
| health | health_profiles | height and biological sex present |
| goals | client_goals | ≥1 active goal |
| training | training_profiles | availableDaysPerWeek + experienceLevel both set |
| equipment | equipment_access | ≥1 available item |
| nutrition | nutrition_profiles | dietaryPattern or allergies + food preference data |
| executive | executive_health_profiles | profile exists + dataConsentAt set |

### Levels

| Level | Score |
|---|---|
| complete | 1.0 |
| partial | 0.5 |
| missing | 0 |
| not_applicable | 1.0 (doesn't reduce overall) |

`overallPercent` = average of the 6 scored sections (identity, health, goals, training, equipment, nutrition). Executive is `not_applicable` for non-executive clients.

### Workout generation blockers (examples)

- Unresolved physician restrictions
- Medical clearance required but not received
- No active goal
- Training availability missing
- Experience level missing
- No available equipment

### Nutrition generation blockers (examples)

- Medical clearance required but not received
- No active goal
- Nutrition preferences missing
- Height not on file (needed for calorie calculations)
- Current bodyweight not on file

Blocker messages shown to clients are **intentionally generic** — they never reveal medical detail or coach-only context.

---

## Future Integrations

### Google Sheets import flow

When the import pipeline is built (future sprint):

1. Fetch rows from `standard-onboarding` and `executive-onboarding` Google Sheet tabs via the existing Sheets API proxy.
2. Match to `public.users` by normalized email.
3. INSERT into `onboarding_submissions` with `source = google_sheets`, `submissionType = standard|executive`.
4. Parse `rawPayload` into domain tables (health_profiles, client_goals, etc.).
5. Mark submission `status = processed`.

The `schemaVersion` field on `onboarding_submissions` allows the parser to handle multiple versions of the onboarding form schema as fields change over time.

### Standard onboarding → domain field mapping (key mappings)

| Form field | Destination table | Destination column | Notes |
|---|---|---|---|
| `full_name` | client_profiles | full_name | Already on client_profiles |
| `dob` | health_profiles | date_of_birth | Parse from form date string |
| `height` | health_profiles | height_inches | Parse "5'10"" → decimal inches |
| `weight` | body_composition_records | weight_pounds | onboarding source |
| `body_fat_pct` | body_composition_records | body_fat_percent | If provided |
| `measurements` | body_composition_records | waist/hips/etc. | Parse free-text; fallback to notes |
| `primary_goal` | client_goals | goal_type | Map form values to enum |
| `goal_timeline` | client_goals | target_date | Derive from "3 months" etc. |
| `medical_conditions` | health_profiles | diagnosed_conditions | Free text |
| `surgeries` | health_profiles | surgical_history | Free text |
| `pain_injuries` | injuries_limitations | description + body_region | Requires parse / coach review |
| `medications` | health_profiles | current_medications | Free text |
| `food_allergies` | nutrition_profiles | allergies | Free text → JSONB array |
| `dietary_restrictions` | nutrition_profiles | intolerances | Free text → JSONB array |
| `nutrition_approach` | nutrition_profiles | dietary_pattern | Direct map |
| `meals_per_day` | nutrition_profiles | current_meals_per_day | Parse "1–2" → integer midpoint or raw |
| `calorie_tracking` | nutrition_profiles | calorie_tracking_experience | Direct |
| `restaurant_frequency` | nutrition_profiles | restaurant_frequency | Direct |
| `favorite_foods` | nutrition_profiles | foods_liked | Free text → JSONB |
| `foods_to_avoid` | nutrition_profiles | foods_disliked / foods_avoided | Free text → JSONB |
| `cooking_level` | nutrition_profiles | cooking_skill_level | Direct |
| `water_intake` | nutrition_profiles | hydration_ounces_average | Parse range → midpoint |
| `alcohol_use` | health_profiles | alcohol_frequency | Direct |
| `years_training` | training_profiles | experience_level | Map card values to enum |
| `equipment_access` | training_profiles | gym_environment | Map option to enum |
| `sleep_hours` | health_profiles | sleep_hours_average | Parse range → midpoint |
| `stress_level` | health_profiles | stress_level | Map "Very low"→1 … "Very high"→5 |
| `phone` | client_profiles | phone | Already on client_profiles |
| `address` | client_profiles | address | Already on client_profiles |
| `occupation` | client_profiles | occupation | Already on client_profiles |
| `emergency_contact` | client_profiles | emergency_contact | Already on client_profiles |
| `esignature` | onboarding_submissions | rawPayload | Never extract to structured field |
| `photo_consent` | onboarding_submissions | rawPayload | Record-keeping only |

### Executive-only additional fields

| Form field | Destination table | Notes |
|---|---|---|
| `time_zone` | client_profiles.timezone + client_preferences.timezone | Normalize to IANA format |
| `last_bloodwork` | executive_health_profiles.bloodworkLastUpdatedAt | Derive approximate date |
| `known_deficiencies` | executive_health_profiles.biomarkersSummary (admin-only) | Free text → JSONB |
| `hormone_protocol` | executive_health_profiles.biomarkersSummary (admin-only) | Admin-only |
| `preferred_communication` | client_preferences.communicationPreference | Direct |
| `checkin_frequency` | client_preferences.preferredCheckInTime area | Adapt |
| `restaurant_preferences` | nutrition_profiles.restaurantFrequency | Free text |
| `household_support` | onboarding_submissions.rawPayload only | Too variable for structured field |
| `performance_priorities` | client_goals.description (executive_performance type) | Create goal record |

### Fields with no current structured destination

These remain in `rawPayload` until a future sprint adds structure:

- `biggest_frustrations`, `why_now`, `success_vision` — coaching context
- `motivation`, `biggest_obstacles` — coaching context
- `work_schedule`, `has_children`, `lifestyle_travel` — lifestyle context (may warrant a `client_lifestyle_profiles` table in Sprint 5B.x)
- `recovery_methods`, `cardio_routine`, `current_program` — training narrative (partially maps to training_profiles.currentTrainingSplit and recoveryCapacity)
- `household_support`, `home_support` — exec lifestyle
- `performance_gaps`, `peak_performance_times` — exec coaching context
- `special_considerations`, `concierge_preferences` — exec service preferences

### Missing inputs required for future generation

**For workout generation (not currently collected):**
- Specific exercise 1-rep max values or training percentages
- Movement screen results (FMS, specific mobility assessments)
- Prior program history (what programs the client has run)
- Specific cardio performance baseline (VO2max, zone HR ranges)
- Rate of perceived exertion calibration

**For nutrition generation (not currently collected):**
- Current caloric intake estimate (not just "do you track")
- Specific macronutrient targets if the client has prior coaching
- Meal timing flexibility relative to training
- Budget per meal / per week in dollar amount
- Whether a personal chef or meal delivery is used

---

## Portal Onboarding Flow (Future Sprint)

In a future sprint, clients will be able to complete or update their onboarding directly from `/portal`. This will:

1. Surface a form pre-populated with existing structured data from the domain tables.
2. On submit: INSERT a new `onboarding_submissions` row (`source = portal`, `submissionType = update`).
3. Reprocess and upsert domain tables.
4. Mark the old submission as `superseded`.
5. Never expose medical data in the browser form — form covers only training, nutrition, goals, and preferences.
6. Health profile updates require coach approval before taking effect.

---

## Executive Performance File Storage (Future Sprint)

Bloodwork PDFs, InBody H30 exports, and physician letters must NOT be stored in `biomarkersSummary` JSONB. Future design:

1. Store files in Supabase Storage with private bucket policies.
2. Store only a reference (storage path + upload timestamp) in `executive_health_profiles`.
3. Add a `biomarker_files` table with: `id, clientId, fileStoragePath, uploadedAt, uploadedBy, fileType, notes`.
4. Access controlled by coach/admin-only server-side signed URLs.
5. No browser-direct upload. All uploads go through a server route handler that validates authorization before calling the Storage API.

---

## Data Retention Strategy

| Table | Retention Rule |
|---|---|
| `onboarding_submissions` | Permanent. Never delete. Mark superseded if replaced. |
| `health_profiles` | Permanent. In-place update via upsert on PK. |
| `body_composition_records` | Permanent. Append-only. Never delete individual measurements. |
| `client_goals` | Permanent. Status transitions only (active → achieved/abandoned/superseded). |
| `injuries_limitations` | Permanent. Status transitions only (active → resolved). |
| `training_profiles` | Current state only. Overwritten on import/update. |
| `nutrition_profiles` | Current state only. Overwritten on import/update. |
| `client_preferences` | Current state only. Overwritten on client update. |
| `executive_health_profiles` | Permanent. In-place update. |
| `equipment_access` | Current state. Items can be marked `available = false`. |

---

## Historical Integrity Rules

1. Never DELETE from `onboarding_submissions` or `body_composition_records`.
2. Never overwrite a `rawPayload` field.
3. Never overwrite a `body_composition_records` row — insert a new one.
4. Goal status transitions are always additive — supersede old goals rather than rewriting them.
5. Injury records are not deleted when resolved — set `status = resolved`, `resolvedAt = date`.
6. Client `users.id` is permanent and never changes.
7. All timestamps use `timestamp with time zone` — never store naive local times.

---

## Files Created (Sprint 5B.3)

| File | Purpose |
|---|---|
| `lib/db/schema-profile.ts` | 10-enum, 10-table Drizzle schema |
| `lib/db/profile-service.ts` | Server-only read helpers |
| `lib/db/profile-readiness.ts` | Deterministic readiness calculator |
| `drizzle/0002_tidy_vision.sql` | Generated migration (not yet applied) |
| `docs/catalyst-os-client-profile.md` | This document |
| `drizzle.config.ts` | Updated to include schema-profile.ts |
| `app/account/page.tsx` | Updated with profile summary (graceful empty states) |
