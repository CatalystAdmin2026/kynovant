# Kynovant Rebrand & Dependency Audit

**Scope:** Full repository scan for "Catalyst Coaching" brand references, third-party
service coupling, and anything that must change (or must *not* change) when this
codebase transitions from **Catalyst Coaching** to **Kynovant**.

**Method:** `git grep` (case-insensitive) across all 271 tracked files for the brand
terms, domains, service integrations, and metadata categories listed in the audit
request, plus manual inspection of the matched files. This audit is read-only — no
application code was modified.

**Repo:** `kynovant-brand-audit` (branch `audit/brand`), a Next.js 16 / Supabase /
Drizzle coaching platform ("Catalyst OS") with Stripe, Calendly, DocuSign, Resend,
and Google Apps Script integrations.

---

## Classification legend

| # | Meaning |
|---|---|
| **1** | Safe to replace automatically (find/replace text, no external system involved) |
| **2** | Requires a manual change in an external account/dashboard (Vercel, Stripe, Supabase, DocuSign, Calendly, Google, DNS, email) |
| **3** | Must remain temporarily for backward compatibility (historical data, applied migrations, old webhook/URL still receiving live traffic) |
| **4** | Legal or business decision required (signed contracts, entity name, LLC name, trademarks) |
| **5** | False positive / ordinary word usage — no action |

---

## 1. Brand name — "Catalyst Coaching" (customer-facing brand)

This is the primary rebrand target. It appears **~330 times across ~45 files**.
Two distinct uses were found and should be tracked separately:

- **"Catalyst Coaching" / "Catalyst Coaching Elite" / "Catalyst Coaching LLC"** — the
  customer-facing business brand, legal entity name, and marketing copy. → Rebrand to Kynovant.
- **"Catalyst OS"** — an internal engineering codename for the platform/dashboard
  architecture, used only in code comments, doc titles, and internal identifiers
  (never shown to end users). See [§7](#7-internal-codename--catalyst-os).

### 1.1 Marketing / public site copy — Class 1

All plain UI copy — safe to find-and-replace, no external system dependency:

| File | Notes |
|---|---|
| `app/(site)/about/page.tsx` | 4 mentions — bio/brand copy |
| `app/(site)/apply/page.tsx` | 3 mentions |
| `app/(site)/enroll/executive-performance/page.tsx` | 1 |
| `app/(site)/enroll/founding-member/page.tsx` | 2 |
| `app/(site)/enroll/legacy/page.tsx` | 2 |
| `app/(site)/enroll/standard/page.tsx` | 5 |
| `app/(site)/executive-onboarding/page.tsx` | 2 |
| `app/(site)/executive-performance-confirmed/page.tsx` | 5 |
| `app/(site)/onboarding-complete/page.tsx` | 3 (2 are the support email, see §4) |
| `app/(site)/onboarding/page.tsx` | 2 |
| `app/(site)/page.tsx` | 3 — homepage hero/brand copy |
| `app/(site)/payment-confirmed/page.tsx` | 3 |
| `app/(site)/programs/page.tsx` | 7 |
| `app/(site)/thank-you/page.tsx` | 3 |
| `app/account/page.tsx` | 1 |
| `app/forgot-password/page.tsx` | 1 |
| `app/login/page.tsx` | 2 |
| `app/reset-password/page.tsx` | 1 |
| `app/setup-password/page.tsx` | 1 |
| `components/AdminGate.tsx` | 1 |
| `components/Footer.tsx` | 4 — site-wide footer, high visibility |
| `components/Navbar.tsx` | 2 — site-wide nav, high visibility |
| `components/OnboardingWizard.tsx` | 1 |
| `components/StrategyCallsTab.tsx` | 1 (admin-only) |
| `components/portal/PortalSidebar.tsx` | 1 |

**Recommendation:** these can be handled with a repo-wide, case-sensitive
find/replace of `Catalyst Coaching` → `Kynovant` (and `Catalyst Coaching Elite` →
`Kynovant`, if there is no separate "Elite" sub-brand in the new name). Spot-check
each file after replacement for grammar (e.g. "a Catalyst Coaching client" →
"a Kynovant client" reads fine; some strings may need light rewording, not just
substitution).

### 1.2 `app/layout.tsx` — SEO / Open Graph metadata — Class 1

```12:34:app/layout.tsx
export const metadata: Metadata = {
  title: "Catalyst Coaching | Private Physique Coaching",
  description: "...",
  icons: { icon: "/logos/mark-gold.png", shortcut: "/logos/mark-gold.png", apple: "/logos/mark-gold.png" },
  openGraph: {
    title: "Catalyst Coaching | Private Physique Coaching",
    description: "Application-based private physique coaching. Real structure. Real results.",
    url: "https://catalystcoachingelite.com",
    siteName: "Catalyst Coaching",
    images: [{ url: "/logos/mark-gold.png", width: 512, height: 512 }],
    type: "website",
  },
};
```

This is the single highest-priority file for SEO/OG: page `<title>`, meta
description, `openGraph.siteName`, `openGraph.url`, and the favicon/OG image path
all need updating together. No `robots.txt`, `sitemap.xml`, or JSON-LD/structured
data (`schema.org`, `application/ld+json`) exists anywhere in the repo — nothing
else to update for SEO. **Class 1** for the text; the `url` field and the
`/logos/mark-gold.png` asset are covered in §3 and §5.

### 1.3 Transactional email templates — Class 1

| File | Mentions |
|---|---|
| `public/emails/welcome-executive.html` | logo text, footer accent, footer headline |
| `public/emails/welcome-standard.html` | `<title>`, logo text, headline, footer headline |
| `app/api/stripe/webhook/route.ts` (inline HTML email builders, lines 150, 166, 183, 207, 219, 232, 234, 281, 341, 354, 356) | Welcome email + admin payment-notification email, includes `from: "Catalyst Coaching <...>"` sender name and email subject lines |

These are static HTML strings — safe to replace, but **the "from" display name in
`app/api/stripe/webhook/route.ts:232` and `:354` should be changed in lockstep with
the Resend sender identity** (see §2 Resend note) so the display name matches the
verified sending domain.

### 1.4 Legal agreement generator scripts — Class 4 (business/legal decision required)

| File | Mentions |
|---|---|
| `scripts/generate-agreement-docx.js` | 9 — generates `Catalyst_Coaching_Agreement_Branded_Template.docx`; body clauses define **"Catalyst Coaching LLC"** as the contracting party throughout (recitals, chargeback clause, IP clause, liability release, limitation of liability), plus header/footer branding and `@catalystcoachingelite` handle |
| `scripts/generate-agreement-pdf.js` | 11 — same content, PDF renderer, `Title`/`Author` PDF metadata fields |
| `scripts/generate-agreement-pdf-clean.js` | 13 — same content, "clean" PDF variant |
| `generated-agreements/Catalyst Coaching Master Client Agreement.pdf` | Pre-generated output artifact |
| `generated-agreements/Catalyst Coaching Master Client Agreement.docx` | Pre-generated output artifact |
| `generated-agreements/Catalyst Coaching Master Client Agreement - Clean.pdf` | Pre-generated output artifact |
| `generated-agreements/README.md` | Explains the two generator scripts and lists contact info to update |

**This is not a simple find/replace.** These scripts define the actual contracting
party in a client-facing legal agreement ("Client releases... **Catalyst Coaching
LLC**, its owner, coaches, affiliates..."). Renaming the entity name in the template
text without a corresponding legal/business decision (is "Catalyst Coaching LLC"
actually being renamed as a legal entity, or is "Kynovant" only a DBA/brand name
layered on the same LLC?) could create a contract that doesn't match the signer's
actual legal counterparty. **Flag for the business owner before touching.** Once
that's settled, the three generator scripts and the pre-generated output files are
mechanically consistent with each other and can be regenerated together.

### 1.5 Backend integration scripts (`.gs`) — Class 1 (text) / Class 2 (deployment)

| File | Mentions |
|---|---|
| `scripts/drive-workspace-backend.gs` | 6 |
| `scripts/onboarding-backend.gs` | 2 |
| `scripts/stripe-events-backend.gs` | 2 |

Comment/label text is Class 1, but these scripts run as **Google Apps Script
deployments tied to a specific Google account/Workspace and specific Google Sheets**
(e.g. "Catalyst Coaching — Stripe Events" sheet name in `env.local.example:98`).
Renaming requires manually renaming the Sheets/Drive folders and, if the underlying
Google account changes, redeploying and issuing new `/exec` URLs — see §6.

---

## 2. Old domain / production URLs

`catalystcoachingelite.com` (and `www.` variant) is hardcoded in **11 places**,
several of which are load-bearing for webhook/redirect correctness:

| File:Line | Context | Class |
|---|---|---|
| `app/admin/page.tsx:951` | `PROD_WEBHOOK_URL` constant shown in the admin Stripe-webhook diagnostics tab | 1 (display only — not the actual registered webhook, see §6) |
| `app/api/docusign/webhook/route.ts:112` | `SITE_ORIGIN` constant used to build links | 1, but verify nothing downstream depends on it matching the *real* origin |
| `app/api/docusign/webhook/route.ts:229` | Footer text in generated email | 1 |
| `app/api/stripe/webhook/route.ts:6` | Comment documenting the registered webhook URL | 1 |
| `app/api/stripe/webhook/route.ts:117` | `SITE_ORIGIN` constant | 1 |
| `app/layout.tsx:29` | `openGraph.url` | 1 |
| `docs/catalyst-os-authentication.md:222,224` | Documents the Supabase "Site URL" and redirect URL that must match the Supabase Auth dashboard config | 2 — this doc is a **guide for a manual Supabase dashboard setting**, not code |
| `env.local.example:182` | Comment showing the Stripe Dashboard webhook URL to register | 2 — instructional text only |
| `generated-agreements/README.md:73` | Contact info note | 1 |
| `scripts/generate-agreement-*.js` (3 files) | Footer text `www.catalystcoachingelite.com` | 4 (bundled with §1.4) |

**No old Vercel deployment URLs (`*.vercel.app`) were found anywhere in tracked
files.** `.vercel/` is not linked in this local checkout (gitignored, absent), so
the actual Vercel project name/production domain/custom-domain binding could not be
inspected from the repo — **this must be checked directly in the Vercel dashboard**
(see §6).

**No GitHub repository URLs referencing this project were found.** The only
`github.com` hits are open-source dependency/sponsor links inside `package-lock.json`
and the boilerplate Next.js README — **Class 5, false positive.**

---

## 3. Logos, favicon, and image assets

| Path | Used by | Class |
|---|---|---|
| `public/logos/mark-gold.png` | Referenced 17 times: `app/layout.tsx` (favicon + OG image), every auth page, `Footer.tsx`, `Navbar.tsx`, `HQSidebar.tsx`, `HQMobileNav.tsx`, `PortalSidebar.tsx`, `MissionEntry.tsx`, `OnboardingWizard.tsx` | 1 — swap the file (or point the same path at a new asset) and every reference updates automatically. Recommend keeping the filename `mark-gold.png` unless the new brand mark isn't gold, to minimize diff noise, or do a global rename + one search/replace of the 17 references. |
| `app/icon.png` | Next.js App Router auto-favicon (implicit — no explicit reference needed) | 1 — replace file contents directly |
| `public/portal/catalyst_bedroom_background.png` | **Not referenced anywhere in the codebase** (checked via `git grep`) | 5 — dead asset. Safe to delete during rebrand cleanup, or rename if it's intended for future use; not a rebrand blocker either way. |
| Two `alt="Catalyst HQ"` attributes in `components/hq/HQMobileNav.tsx:30` | Alt text, not the asset itself | 1 |

No other brand-specific images (banners, watermarks) were found; `public/next.svg`,
`public/vercel.svg`, `public/globe.svg`, `public/file.svg`, `public/window.svg` are
framework boilerplate — **Class 5**.

---

## 4. Email addresses

| Address | Where it appears | Class |
|---|---|---|
| `catalyst.coaching.headcoach@gmail.com` | 16 occurrences: onboarding pages (support instructions), `onboarding-complete/page.tsx` (mailto link), `payment-confirmed/page.tsx` (mailto link), `app/api/docusign/send-agreement/route.ts:139` (DocuSign "Coach" role signer email — **functional, not just display**), `generated-agreements/README.md`, both `public/emails/*.html` templates, all three agreement generator scripts, `scripts/verify-security.ts` (comments referencing test logins) | **2** — this is a real Gmail mailbox. Changing the *displayed* address in code is Class 1, but the underlying mailbox needs to keep receiving mail (forwarding rule) or DocuSign envelopes will route the "Coach" signer role to a dead inbox. Coordinate the code change with either (a) creating a new Kynovant-domain mailbox and updating DNS/MX, or (b) keeping Gmail forwarding active during transition. |
| `catalyst.coaching.headcoach+clienttest@gmail.com` / `+test@gmail.com` | `scripts/verify-security.ts:106,111`, `docs/catalyst-os-authentication.md:239` | 1 — comments only, describes manual test procedure |
| `test.client@catalyst.test` | `scripts/acceptance-test-sprint61.ts:1621` | 5 — synthetic test-fixture email on the reserved `.test` TLD, never sent anywhere. No action needed, though could be renamed to `@kynovant.test` for consistency. |
| `magg3@icloud.com`, `ekgmedspa@gmail.com`, `hirgrl4life@yahoo.com` | `app/admin/page.tsx:196-198` | 5 — hardcoded map of **real existing client emails → display names** for the admin dashboard. Not brand-related; flagged only because it's client PII living in source rather than the database — worth a follow-up ticket independent of the rebrand. |
| `you@example.com`, `coach@example.com` | Various placeholder inputs/docs | 5 — placeholder text |

---

## 5. Social handles

Only one handle was found: **`@catalystcoachingelite`**, in the footer of the
three agreement-generator scripts (`scripts/generate-agreement-docx.js:322`,
`scripts/generate-agreement-pdf-clean.js:347`, `scripts/generate-agreement-pdf.js:358`).
Bundled with the §1.4 legal-document decision — **Class 4**. No Instagram, TikTok,
X/Twitter, Facebook, or LinkedIn handles/URLs are hardcoded anywhere else in the
app (the two `Instagram`/`TikTok` hits in `app/(site)/apply/page.tsx:232,234` are
just `<option>` labels in a lead-source dropdown — **Class 5**).

---

## 6. Third-party integrations requiring manual dashboard changes

These cannot be fixed by editing the repo. Each is a **Class 2** action item for
whoever holds the account:

| Service | What needs to change | Where it's referenced in code |
|---|---|---|
| **Vercel** | Project name, production custom domain, any domain redirects, environment variables tied to `catalystcoachingelite.com`. Repo has no local `.vercel/` link to inspect — check the dashboard directly. | N/A (external) |
| **Supabase Auth** | Site URL and Redirect URLs allow-list (currently `https://catalystcoachingelite.com/auth/callback` + `http://localhost:3000/auth/callback` per `docs/catalyst-os-authentication.md:222-225`) must be updated to the new domain, or auth callbacks will fail after DNS cutover. | `app/auth/callback/route.ts`, `app/auth/role-redirect/route.ts`, `proxy.ts`, `lib/supabase/*` (all read `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — values, not names, need no change unless the Supabase project itself is renamed) |
| **Stripe** | Webhook endpoint URL (`Developers → Webhooks`) currently registered at `https://www.catalystcoachingelite.com/api/stripe/webhook` (per `env.local.example:182` and the `PROD_WEBHOOK_URL` display constant in `app/admin/page.tsx:951`) must be updated to the new domain — old endpoint will silently stop receiving events once DNS moves. Statement descriptor / business name shown to cardholders should also be checked in Stripe settings. | `app/api/stripe/webhook/route.ts`, `lib/stripe.ts`, `app/admin/page.tsx` |
| **DocuSign** | Template(s) referenced by `DOCUSIGN_TEMPLATE_ID` are branded "Catalyst Coaching Master Client Agreement" inside the DocuSign template editor itself — must be edited/re-uploaded in the DocuSign portal, independent of the code. Also gate on the §1.4 legal decision. Webhook Connect configuration (`DOCUSIGN_WEBHOOK_SECRET`) endpoint URL should be re-verified after domain cutover. | `app/api/docusign/send-agreement/route.ts`, `app/api/docusign/debug-template/route.ts`, `app/api/docusign/webhook/route.ts` |
| **Calendly** | Scheduling URL `calendly.com/catalyst-coaching-headcoach/catalyst-coaching-strategy-call` (`components/CalendlyEmbed.tsx:10`, `app/(site)/thank-you/page.tsx:87`) is a real Calendly account/event-type slug. Changing the org name may or may not change this slug — check the Calendly account settings; if the slug changes, both hardcoded strings need updating together. | `components/CalendlyEmbed.tsx`, `app/(site)/thank-you/page.tsx`, `app/api/calendly/events/route.ts` (uses env vars, not the slug, so unaffected) |
| **Google Apps Script / Sheets / Drive** | Three GAS web-app deployments are hardcoded (see below) and tied to specific Google Sheets currently named with "Catalyst Coaching" (e.g. `env.local.example:98` — *"Create a new Google Sheet: 'Catalyst Coaching — Stripe Events'"*). Renaming the Sheets/Drive folders is manual; if the underlying Google account/Workspace changes, the scripts must be redeployed and the `/exec` URLs rotated. | `scripts/*.gs`, `env.local.example`, `lib/sheets.ts` |
| **Resend** (transactional email) | Sender identity/domain verification for the `from: "Catalyst Coaching <...>"` address in `app/api/stripe/webhook/route.ts:232,354` — must match a verified sending domain in the Resend dashboard, or email will fail DKIM/SPF once the display name changes to Kynovant. | `app/api/stripe/webhook/route.ts` |

### Note on hardcoded GAS URLs (flag, not a rebrand blocker)

Three real (not placeholder) Google Apps Script `/exec` URLs are checked into
source and docs — `app/(site)/apply/page.tsx:36`, `app/(site)/executive-onboarding/page.tsx:13`,
`app/(site)/onboarding/page.tsx:13`, and mirrored in `env.local.example:44,86`. These
act like unlisted bearer endpoints. Not directly a rebrand item, but if the Google
account is migrated/renamed as part of this transition, these will need to be
regenerated and swapped in the same commit — worth doing at the same time rather
than as a separate pass.

---

## 7. Internal codename — "Catalyst OS"

Distinct from the customer-facing brand: **"Catalyst OS"** is the internal name for
the platform/dashboard architecture, used in ~50 files but **never rendered to an
end user** — it lives in file-header comments, doc titles, and a few identifier
names:

- Doc titles: `docs/CATALYST_OS_PHILOSOPHY.md`, `docs/catalyst-os-authentication.md`,
  `docs/catalyst-os-client-profile.md`, `docs/catalyst-os-data-foundation.md`,
  `docs/catalyst-os-exercise-library.md`
- One-line file-header comments (e.g. `// Catalyst OS — Proxy...` in `proxy.ts:1`,
  `// Catalyst OS — Mock Data` in `lib/portal/mockData.ts:2`) across most of
  `lib/db/*`, `lib/auth/*`, `lib/supabase/*`, `app/api/internal/db-health/route.ts`,
  several `app/*` pages, and several `scripts/*`
- One SQL migration filename: `drizzle/0001_catalyst_auth.sql` (tag
  `0001_catalyst_auth` recorded in `drizzle/meta/_journal.json:16`)

**Classification:**
- Comment text/doc titles → **Class 1** if you want to rename the internal codename
  too (e.g. to "Kynovant OS"), but this is a **naming preference, not a rebrand
  requirement** — nothing user-facing depends on it. Recommend batching as a
  low-priority cleanup pass, separate from the customer-facing rebrand.
- `drizzle/0001_catalyst_auth.sql` and its `_journal.json` tag → **Class 3, do not
  rename.** This migration has already been applied to any existing database, and
  Drizzle's migration journal keys off the filename/tag. Renaming it would not
  re-run anything, but breaks the historical audit trail and risks a checksum
  mismatch if Drizzle re-hashes migrations on a future `drizzle-kit` version.
  Leave as-is; a rebrand doesn't require touching applied migrations.

---

## 8. Package/project metadata

| File | Finding | Class |
|---|---|---|
| `package.json:2` | `"name": "catalyst-coaching-site"` | 1 — cosmetic, not published to a registry (`"private": true`), but should match the repo/Vercel project name for consistency |
| `package-lock.json:2,8` | Same `"name"` field, auto-mirrors `package.json` | 1 — regenerate via `npm install` after changing `package.json`, don't hand-edit |
| `README.md` | Generic `create-next-app` boilerplate, zero brand references | 5 — false positive, no action (though worth eventually replacing with real project documentation, unrelated to rebrand) |

---

## 9. Database seed / demo data

- **No demo/seed script currently exists in `scripts/`** — only `scripts/seed-exercises.ts`,
  which seeds the exercise-library taxonomy (exercise names like "Barbell Bench
  Press") and contains no brand references. **Class 5.**
- Hardcoded client email→name map in `app/admin/page.tsx:196-198` is real client
  PII, not demo data — see §4.
- No other seeded rows, fixtures, or mock records reference "Catalyst" as a brand
  string. `lib/portal/mockData.ts` and `lib/portal/briefingData.ts` only reference
  "Catalyst OS" in a header comment (§7), not in the mock content itself.

---

## 10. Legal / privacy documents

**No `privacy`, `terms`, or `legal` pages/routes exist anywhere in `app/`.** The
only legal documents in the repo are the generated client agreements covered in
§1.4. If Kynovant needs a Privacy Policy or Terms of Service page for the new
domain, that's net-new work, not a migration item — flagged here so it isn't
missed, but out of scope for a rename audit.

---

## 11. Environment variables

Reviewed `env.local.example` (the only env template in the repo; no `.env*` files
are present in this checkout — all gitignored per `.gitignore:29`). None of the
env var **names** encode the brand (they're generically named
`STRIPE_SECRET_KEY`, `CALENDLY_PERSONAL_ACCESS_TOKEN`, `DOCUSIGN_*`,
`NEXT_PUBLIC_SUPABASE_URL`, `SHEETS_APPLICATIONS_GAS_URL`, etc.) — **Class 5, no
renaming needed.**

What *does* need attention (all **Class 2**, done in the relevant vendor
dashboard + then updated in Vercel's env var settings, not in this repo):

- Two real GAS `/exec` URLs are pasted as example *values* in `env.local.example:44,86` (see the GAS note in §6) — these are also live in the actual `.env.local`/Vercel env (not this file), and in Vercel's Environment Variables panel.
- `STRIPE_EVENTS_GAS_URL` value depends on the Google Sheet named "Catalyst Coaching — Stripe Events" (§6).
- No env var currently stores the site's own domain (no `NEXT_PUBLIC_SITE_URL`) — the domain is hardcoded as `SITE_ORIGIN` string literals instead (§2). **Recommend introducing a `NEXT_PUBLIC_SITE_URL` (or similar) env var during this rebrand** so future domain changes don't require code edits in `app/api/stripe/webhook/route.ts` and `app/api/docusign/webhook/route.ts`. This is a suggestion, not a finding — noting it here since the audit surfaced the same hardcoded pattern in two files.

---

## Prioritized migration checklist

**Phase 0 — Decisions (blocking, do first)**
1. [ ] **Legal/business:** Confirm whether "Catalyst Coaching LLC" the legal entity is being renamed, or only the public-facing brand/DBA. This gates §1.4 (client agreement text) and the Stripe statement descriptor.
2. [ ] Confirm final brand name usage (`Kynovant` vs `Kynovant Coaching` / any tagline) so all copy edits are consistent in one pass.

**Phase 1 — External accounts (Class 2, do before or same day as DNS cutover)**
3. [ ] Vercel: verify project name, add/confirm new domain, plan cutover.
4. [ ] Supabase Auth: update Site URL + Redirect URL allow-list to new domain (`docs/catalyst-os-authentication.md:222-225`).
5. [ ] Stripe: update the registered webhook endpoint URL; review statement descriptor/business name.
6. [ ] DocuSign: update/re-brand the template referenced by `DOCUSIGN_TEMPLATE_ID`; re-verify Connect webhook URL post-cutover.
7. [ ] Calendly: check whether the account rename changes the scheduling slug `catalyst-coaching-headcoach/...`.
8. [ ] Google: rename/reorganize the Sheets & Drive folders backing the three Apps Script deployments; redeploy and rotate `/exec` URLs if the underlying Google account changes.
9. [ ] Resend: verify sending domain for the new `from` display name.
10. [ ] Decide on `catalyst.coaching.headcoach@gmail.com` — new mailbox + forwarding, or keep as-is during transition.

**Phase 2 — Code (Class 1, safe once Phase 0/1 are settled)**
11. [ ] `app/layout.tsx` — title, description, `openGraph` block, favicon/OG image path.
12. [ ] Swap `public/logos/mark-gold.png` (17 references) and `app/icon.png`.
13. [ ] Find/replace `Catalyst Coaching` → `Kynovant` across the ~24 site/component files in §1.1 (spot-check phrasing after replace).
14. [ ] Update the two `public/emails/*.html` templates and the inline email builders in `app/api/stripe/webhook/route.ts` (logo text, subject lines, `from` display name).
15. [ ] Update `SITE_ORIGIN` constants in `app/api/stripe/webhook/route.ts:117` and `app/api/docusign/webhook/route.ts:112`, and `PROD_WEBHOOK_URL` in `app/admin/page.tsx:951`, once the new domain is live. Consider introducing `NEXT_PUBLIC_SITE_URL` env var here instead of hardcoded strings (§11).
16. [ ] Update `components/CalendlyEmbed.tsx:10` and `app/(site)/thank-you/page.tsx:87` if the Calendly slug changes (Phase 1 item 7).
17. [ ] Update `catalyst.coaching.headcoach@gmail.com` references across code once the mailbox decision (item 10) is made — pay special attention to `app/api/docusign/send-agreement/route.ts:139` (functional signer-role email, not just display text).
18. [ ] `package.json` / `package-lock.json` project name → run `npm install` after editing `package.json` name field to keep the lockfile in sync.

**Phase 3 — Legal artifacts (Class 4, gated on item 1)**
19. [ ] Once the entity/DBA question is resolved: update `scripts/generate-agreement-docx.js`, `scripts/generate-agreement-pdf.js`, `scripts/generate-agreement-pdf-clean.js`, and regenerate the three files in `generated-agreements/`. Update the `@catalystcoachingelite` handle in the same pass if applicable.

**Phase 4 — Optional cleanup (not required for rebrand correctness)**
20. [ ] Decide whether to rename the internal "Catalyst OS" codename (§7) — comments/doc titles only, low priority.
21. [ ] Delete or repurpose the unreferenced `public/portal/catalyst_bedroom_background.png`.
22. [ ] Do **not** touch `drizzle/0001_catalyst_auth.sql` or its journal tag — historical migration, leave as-is (§7).
23. [ ] Consider moving the hardcoded client email→name map (`app/admin/page.tsx:196-198`) into the database — unrelated to rebrand, flagged as a drive-by finding.

---

## Appendix: search terms run

`catalyst` (case-insensitive, all files) · `catalyst-coaching` · `catalystcoaching` ·
`catalystcoachingelite.com` · `vercel.app` · `github.com` · email regex ·
`calendly` · `docusign` · `script.google.com` / apps script / `.gs` files ·
`instagram|twitter|facebook.com|tiktok|linkedin.com/company` · `favicon|logo` ·
`application/ld+json|schema.org|jsonld` · `privacy|terms|legal` (paths + text) ·
`supabase.co|NEXT_PUBLIC_SUPABASE` · `redirectTo|callbackUrl|redirect_uri|/auth/callback` ·
`kynovant` (sanity check — zero hits, confirming no partial migration has started).
