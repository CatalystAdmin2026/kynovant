# Kept Performance Homepage + Social Proof — Redesign Handoff

Research-only findings from the Kept Performance domain-cutover task
(Phase 12). No homepage code was changed by this pass — this is the
handoff for the next dedicated task: **Kept Performance Homepage +
Social Proof Conversion Redesign**.

## Testimonial assets — fully recoverable from git history

Real client transformation content existed on the old Catalyst
homepage and was removed at some point before the Kept Performance
rebrand (the current `app/(site)/page.tsx` has zero testimonial/social
proof content). It is **not lost** — both the copy and the photos are
still reachable in git history and were verified reachable
(`git cat-file -e`) during this pass:

- `9c4c1b1` — "Add client transformation testimonials" (copy)
- `fb55046` — "Add premium transformation section with real client
  photos" (copy + 10 image files)

**Three real, named clients, each with before/after photos, a stat
line, and a written testimonial quote:**

| Client | Stats | Images (in `fb55046`) |
|---|---|---|
| Maggie E. | Age 23 · Female · 12 months — lost ~30 lbs, went on to competitive bodybuilding | `maggie_eaker_before.jpeg`, `maggie_eaker_after.jpeg` |
| Megi J. | Age 27 · Female · 11 months — lean muscle gain, rebuilt relationship with food | `megi_jas_before.jpeg`, `megi_jas_after.jpeg` |
| Joel R. | 2×3 gallery layout (6 photos) | `joel_resto_before.jpeg`, `joel_resto_before2/3.jpeg`, `joel_resto_after.jpeg`, `joel_resto_after2/3.jpeg` |

To restore: `git show fb55046:public/images/<file> > public/images/<file>`
for each asset, then adapt the card markup from `git show fb55046:app/page.tsx`
(the "Card 1/2/3" testimonial section). **The recovered copy says
"Catalyst Coaching" by name** (e.g. "Maggie came to Catalyst Coaching
ready to...") — that needs a brand find/replace to "Kept Performance"
as part of restoring it, not a blind copy-paste.

No other testimonial assets (video, additional clients, logos) were
found anywhere else in the repo or git history.

## Current homepage conversion weaknesses (as of this pass)

Live-audited `https://www.keptperformance.com/` during this task.
Current section order: hero ("You Made the Promise. Keep It.") →
"Built For Follow-Through" → "How Coaching Works" → "Why Kept" →
"Powered By Kynovant" → CTA.

- **Zero social proof.** No testimonials, no before/after photos, no
  client count, no results data anywhere on the page — despite three
  strong, real, recoverable testimonials existing in history (above).
  This is the single biggest conversion gap: a visitor has no
  third-party validation before being asked to apply.
- **No visible outcomes/stats.** No aggregate claims like client
  count, average results, or years coaching — even conservative,
  honest framing (e.g., "12-month client average," not efficacy
  claims) is absent.
- **CTA density is flat.** Only two CTA moments (top hero, bottom
  closing) versus `/programs`' pattern of a CTA after nearly every
  section — the homepage could reasonably add one after a new social
  proof section without feeling pushy.

## Recommended structure for the redesign

Not prescriptive — for the next task to evaluate — but based on what
exists today plus the recovered assets:

1. Hero (keep — "You Made the Promise. Keep It." tests fine, no
   evidence it's underperforming)
2. **New: Social proof section** — restore the 3-client before/after
   cards (Maggie, Megi, Joel), rebranded, placed high on the page
   (directly under the hero or after "Built For Follow-Through")
   rather than buried at the bottom
3. Built For Follow-Through / How Coaching Works / Why Kept (keep,
   reorder TBD by the redesign task)
4. Powered By Kynovant (keep — this disclaimer is load-bearing for
   the Kynovant/Catalyst isolation architecture; don't drop it)
5. CTA

## Explicitly out of scope for this handoff

This pass did not touch `app/(site)/page.tsx`, did not restore any
image asset to `public/images/`, and made no visual/structural
homepage changes — per this task's explicit instruction not to
broadly redesign the homepage here. Testimonial copy/name/consent
status (i.e., whether these three clients are still reachable to
reconfirm consent to display their photos publicly under the new
"Kept Performance" brand rather than "Catalyst Coaching") was not
verified and should be confirmed by Jermaine before restoring.
