# Kynovant Rebrand — QA & Integration Validation Plan

Status: **Planning only.** No application code has been modified to produce this
document. This plan will be executed once `audit/brand`, `rebrand/app`, and
`rebrand/docs` (currently identical to `main` at `0b0630e`) carry real rebrand
commits and are ready to merge.

Scope of the rebrand: `catalystcoachingelite.com` / "Catalyst Coaching" / "Catalyst OS"
→ `kynovant.com` / "Kynovant". This plan validates that the rename is complete,
that nothing user-facing or integration-facing silently breaks, and that the old
domain/brand still degrades gracefully where external systems (DocuSign, Stripe,
search engines, bookmarks) may reference it after cutover.

---

## 1. Baseline inventory (as of this scan, pre-rebrand)

Recorded so every later diff has a "before" to compare against.

**Branches in scope:** `audit/brand`, `rebrand/app`, `rebrand/docs` (all currently
`== main`, no rebrand commits yet).

**Stack:** Next.js 16.1.6 (App Router), React 19.2.3, TypeScript, Tailwind v4,
Supabase auth, Drizzle ORM + Postgres, Stripe, Resend, DocuSign, Calendly,
Google Apps Script (Sheets/Drive), PDF/DOCX generation (pdfkit, docx).

**Hardcoded `catalystcoachingelite.com` references found (12 locations):**
| File | Context |
|---|---|
| `app/layout.tsx:29` | `openGraph.url` metadata |
| `app/admin/page.tsx:951` | `PROD_WEBHOOK_URL` constant (Stripe) |
| `app/api/docusign/webhook/route.ts:112` | `SITE_ORIGIN` constant |
| `app/api/docusign/webhook/route.ts:229` | Email footer HTML text |
| `app/api/stripe/webhook/route.ts:6` | Comment documenting webhook URL |
| `app/api/stripe/webhook/route.ts:117` | `SITE_ORIGIN` constant |
| `generated-agreements/README.md:73` | Doc note re: footer contact info |
| `docs/catalyst-os-authentication.md:222,224` | Supabase Site URL / redirect URL docs |
| `scripts/generate-agreement-pdf.js:354,358` | PDF footer text + social handle |
| `scripts/generate-agreement-pdf-clean.js:343,347` | PDF footer text + social handle |
| `scripts/generate-agreement-docx.js:321-322` | DOCX footer text + email + social handle |

**"Catalyst" brand-name occurrences:** 112 files (`grep -ril catalyst`, excluding
`node_modules`/`.git`). This count is the baseline denominator for the sweep in
§18 — it is expected to shrink to near-zero (minus intentionally historical
references) after rebrand.

**No `kynovant` references exist anywhere in the repo yet** (confirmed via
`grep -rli kynovant .`).

**Metadata / icons today:**
- Single `<title>`/`<meta description>`/OG block defined once, in `app/layout.tsx` (no per-route overrides found).
- Icons: only `app/icon.png` (Next.js auto favicon convention) + `public/logos/mark-gold.png` referenced explicitly in `metadata.icons`. **No `manifest.json`/`site.webmanifest`, no `apple-touch-icon` set beyond the one PNG, no `robots.txt`, no `sitemap.xml`.**
- No `vercel.json` / `vercel.ts` in the repo — no platform-level redirect/header config exists today. Domain redirects, if any are needed post-rebrand, do not currently exist anywhere (not in `proxy.ts`, not in Next config, not in a Vercel config file).

**Routing surface (App Router):**
- Public marketing/site routes under `app/(site)/`: `about`, `apply`, `enroll` (+ `executive-performance`, `founding-member`, `legacy`, `standard`), `executive-onboarding`, `executive-performance-confirmed`, `mission-entry-preview`, `onboarding`, `onboarding-complete`, `payment-confirmed`, `portal-preview`, `programs`, `thank-you`.
- Auth routes: `login`, `forgot-password`, `reset-password`, `setup-password`, `auth/callback`, `auth/role-redirect`.
- Authenticated client portal: `portal`, `portal/check-ins(+/new,+/[checkInId])`, `portal/documents`, `portal/history(+/[sessionId])`, `portal/program`, `portal/progress`, `account`.
- Authenticated coach workspace ("HQ"): `hq`, `hq/blueprints(+/[id])`, `hq/check-ins(+/[checkInId])`, `hq/clients(+/[clientId])`, `hq/programs(+/[id])`.
- Admin: `admin`, `admin/blueprints(+/[id])`, `admin/programs(+/[id])`.
- Dev-only: `dev-preview/progress`.
- `proxy.ts` (Next 16's middleware) protects `/portal`, `/account`, `/hq`, `/admin` and refreshes Supabase sessions on `/login`, `/auth/*`. It explicitly does **not** intercept `/api/stripe`, `/api/docusign`, `/api/sheets`, `/api/calendly`, `/api/internal` (documented in the file's header comment).

**API routes (27 total):** Calendly (`/api/calendly/events`), DocuSign (`/api/docusign/{debug-template,send-agreement,webhook}`), Stripe (`/api/stripe/webhook`), Google Sheets proxy (`/api/sheets/[sheet]`), internal admin CRUD (`/api/internal/*` — client-programs, exercises, programs, workout-templates, db-health), portal (`/api/portal/{today-workout,workout-history,workout-session}`), milestones (`/api/milestones/acknowledge`).

**Forms (`<form>` elements) found in:** `app/hq/blueprints/page.tsx`, `app/hq/programs/page.tsx`, `app/admin/blueprints/page.tsx`, `app/admin/programs/page.tsx`, `app/(site)/apply/page.tsx`, `app/forgot-password/page.tsx`, `app/reset-password/page.tsx`, `app/setup-password/page.tsx`, `app/login/page.tsx`, `components/BlueprintEditor.tsx`, `components/AdminGate.tsx`, `components/hq/workspace/GoalManager.tsx`. Enrollment funnel forms live under `app/(site)/enroll/*` and post through `lib/enrollment.ts`.

**Generated agreements:** `generated-agreements/` currently holds a committed PDF and DOCX sample (`Catalyst Coaching Master Client Agreement.*`) generated by `scripts/generate-agreement-{pdf,pdf-clean,docx}.js`. These scripts hardcode brand text, footer URL, and social handle (see table above) rather than reading them from a shared config.

**Google Apps Script backends (not part of this repo's deploy, but referenced/maintained here):** `scripts/drive-workspace-backend.gs`, `scripts/onboarding-backend.gs`, `scripts/stripe-events-backend.gs`. Their deployed `/exec` URLs are supplied via env vars (`SHEETS_APPLICATIONS_GAS_URL`, `SHEETS_ONBOARDING_GAS_URL`, `STRIPE_EVENTS_GAS_URL`) — see `env.local.example`.

**Automated tests:** There is **no** `npm test` script and no Jest/Vitest/Playwright config. "Automated test suite" currently means the 10 `scripts/acceptance-test-*.ts` files, each run individually via `npx tsx scripts/acceptance-test-<name>.ts`. They do file-content assertions and lightweight runtime checks (see e.g. `scripts/acceptance-test-auth.ts` header comment: "20 deterministic tests verifying auth flows, portal routes, security invariants"). This plan treats "run the automated test suite" as running all 10 scripts and confirming each reports 0 failures.

---

## 2. Environment setup for QA

1. Pull the target rebrand branch (or the merge-candidate integration branch) locally.
2. `cp env.local.example .env.local` and populate real/staging credentials for: Supabase, Stripe, Resend, DocuSign, Calendly, the three Google Apps Script `GAS_URL`s, `INTERNAL_API_SECRET`.
3. Confirm DNS/hosting status of `kynovant.com` and `www.kynovant.com` (staging alias or production, per what's being validated) and of `catalystcoachingelite.com` (must still resolve during the transition window for §21).
4. `npm ci` (not `npm install`) to get a reproducible tree matching `package-lock.json`.

---

## 3. Validation phases

Each phase lists **what to run/check**, **pass criteria**, and **where prior brand references were known to live** so the rebrand's completeness can be checked directly against §1.

### Phase 1 — Application startup
- `npm run dev`, load `http://localhost:3000/`.
- Confirm no unhandled server errors in terminal, no red Next.js error overlay.
- Confirm env-var validation (Supabase/Stripe/etc. client init) doesn't throw on cold start.
- Pass: dev server boots clean, home route renders.

### Phase 2 — Production build
- `npm run build`.
- Confirm zero build errors/warnings introduced by the rebrand (font loading, image imports, metadata typing).
- `npm run start` against the production build; smoke-load `/`, `/login`, `/portal`, `/hq`, `/admin`.
- Pass: build succeeds, `next start` serves all smoke routes with 200s (or expected redirects for protected routes).

### Phase 3 — Lint and TypeScript
- `npm run lint` (ESLint 9 flat config, `eslint.config.mjs`).
- `npx tsc --noEmit` for a full type-check pass (no dedicated script exists today — run directly).
- Pass: zero lint errors, zero type errors. New warnings introduced by renamed identifiers/types are treated as blocking, not advisory.

### Phase 4 — Automated test suite
- Run all 10 scripts in `scripts/acceptance-test-*.ts` via `npx tsx <path>`.
- Pay special attention to any that assert on brand strings or URLs (e.g. auth redirect allowlists, schema regression checks) since a rebrand can silently break a hardcoded assertion in either direction (old brand assumed present, or new brand not yet whitelisted).
- Pass: every script reports 0 failures; capture and diff the pass/fail counts against a pre-rebrand baseline run on `main`.

### Phase 5 — Navigation
- Walk every top-level nav/link surface: public site header/footer, portal sidebar, HQ sidebar, admin sidebar.
- Confirm no link text, `alt`, `aria-label`, `title`, or `href` still says "Catalyst" or points at `catalystcoachingelite.com`.
- Confirm internal route paths (`/hq`, `/portal`, etc.) were **not** renamed unintentionally — only brand text/assets should change, not URL structure, unless the rebrand plan explicitly calls for path renames (confirm with the rebrand branch author before flagging path changes as a defect).

### Phase 6 — Public pages
- Every route under `app/(site)/*` listed in §1, plus `/login`, `/forgot-password`, `/reset-password`, `/setup-password`.
- Visual check for logo assets (`public/logos/mark-gold.png` is the only current logo asset — confirm it or its replacement is swapped, not just referenced by old filename), copy, footer contact info, social handles.
- Confirm `public/portal/catalyst_bedroom_background.png` and any other brand-named asset filenames are either renamed or, if left as-is, that this is a deliberate/acceptable exception (filename leakage doesn't break functionality but is a brand-hygiene finding).

### Phase 7 — Authenticated pages
- Log in as each role (client/portal, coach/HQ, admin) and walk: `/portal/*`, `/account`, `/hq/*`, `/admin/*`.
- Confirm `proxy.ts` redirect-to-login behavior (`?next=` param) still works unauthenticated, and that the redirect target itself carries no hardcoded old-domain absolute URL (it should stay relative).
- Confirm session refresh still works post-rebrand if any Supabase project settings (Site URL, redirect URLs — see `docs/catalyst-os-authentication.md:222-224`) were part of the rebrand.

### Phase 8 — API routes
- Exercise all 27 routes listed in §1 (or confirm coverage via `scripts/acceptance-test-*` where applicable).
- Specifically re-check the four routes that were **not** covered by `proxy.ts` per its own header comment — `/api/stripe/webhook`, `/api/docusign/*`, `/api/sheets/*`, `/api/calendly/*` — since they build absolute URLs manually (`SITE_ORIGIN` constants) rather than deriving them from request context, making them the highest-risk spots for stale-domain bugs.
- Pass: no route hardcodes `catalystcoachingelite.com` anymore (except where §21 intentionally requires backward-compat handling), all return expected status codes.

### Phase 9 — Forms
- Submit each form found in §1: apply/enroll funnel (`app/(site)/enroll/*`, `app/(site)/apply`), auth forms (login/forgot/reset/setup password), HQ/admin blueprint & program editors, `GoalManager`.
- Confirm success/error copy references the new brand, confirm redirect-after-submit targets are correct, confirm any email sent as a result (Resend) carries new branding (see Phase 12 crossover with DocuSign/Stripe emails).

### Phase 10 — Generated agreements
- Regenerate a sample agreement via `scripts/generate-agreement-{pdf,pdf-clean,docx}.js` against the rebrand branch.
- Diff output against the committed baseline in `generated-agreements/` — confirm brand name, footer URL (`www.catalystcoachingelite.com` → `www.kynovant.com`), email, and social handle (`@catalystcoachingelite` → new handle) all updated consistently across all three generator scripts (PDF, PDF-clean, DOCX use independently duplicated footer strings — a partial rebrand across only some of the three is a likely failure mode).
- Confirm `generated-agreements/README.md` note (line 73) is updated to match, and re-commit a refreshed sample output if the repo convention is to keep one checked in.

### Phase 11 — DocuSign integration
- End-to-end: trigger `send-agreement`, complete a sandbox envelope, confirm `webhook` receives `envelope-completed` and fires the "Activate Coaching" email correctly.
- Verify `SITE_ORIGIN` constant in `app/api/docusign/webhook/route.ts:112` and the footer HTML at line 229 both point at the new domain, and that the resulting `enrollUrl` in the email is a live, correct link.
- Verify DocuSign's own template/branding config (logins to DocuSign's dashboard, outside this repo) if templates reference the old brand name — flag as an external-system follow-up if so, since it's outside repo scope.
- Confirm `debug-template` route still functions for template inspection.

### Phase 12 — Google Drive / Apps Script integrations
- Confirm the three `.gs` backend scripts (`drive-workspace-backend.gs`, `onboarding-backend.gs`, `stripe-events-backend.gs`) are either updated in their deployed Apps Script projects (external to this repo — coordinate separately) or confirmed brand-agnostic.
- Confirm `lib/sheets.ts` and `app/api/sheets/[sheet]/route.ts` still route correctly to the `SHEETS_APPLICATIONS_GAS_URL` / `SHEETS_ONBOARDING_GAS_URL` / `STRIPE_EVENTS_GAS_URL` env vars — these are deployment URLs, not brand strings, so they should be unaffected by the rebrand, but re-verify connectivity since it's on the critical path for `/apply` and `/onboarding`.
- Spot-check that any Sheet header rows / doc titles created by these scripts (if hardcoded in the `.gs` files) were updated.

### Phase 13 — Calendly
- Confirm `lib/calendly.ts`, `app/api/calendly/events/route.ts`, `components/CalendlyEmbed.tsx`, `components/StrategyCallsTab.tsx`, and the embed on `app/(site)/thank-you/page.tsx` and `app/admin/page.tsx` all point at the correct (new, if changed) Calendly scheduling link/org.
- Confirm the Calendly account/event-type branding itself (external to repo) reflects Kynovant if that's in scope for this rebrand.

### Phase 14 — Metadata
- `app/layout.tsx`: `title`, `description`, `openGraph.title/description/url/siteName` all updated. This is currently the **only** metadata block in the app (no per-route overrides exist) — confirm the rebrand branch either keeps this single-source approach or, if it adds per-route metadata, that every route is covered consistently.
- Add/verify `robots.txt` and `sitemap.xml` if the rebrand introduces them (neither exists today — not a regression if still absent, but worth confirming it's a deliberate decision, not an oversight, given a domain change is exactly when search engines re-crawl).

### Phase 15 — Open Graph previews
- Validate `openGraph.url` (currently hardcoded to `https://catalystcoachingelite.com`, `app/layout.tsx:29`) and `openGraph.images` (currently `/logos/mark-gold.png`) point at new domain/new asset.
- Test actual rendering via a link-preview check (paste the production URL into Slack/iMessage/Twitter-card validator or equivalent) — metadata correctness in source doesn't guarantee crawler cache is fresh; note that OG caches (Facebook/LinkedIn/Slack) may need manual cache-busting post-launch.
- Confirm image dimensions (currently `512x512`, square) are still appropriate for the replacement asset, or update the declared `width`/`height` to match.

### Phase 16 — Favicon and app icons
- Confirm `app/icon.png` (Next's file-convention favicon) is replaced with the new mark.
- Confirm the explicit `metadata.icons.{icon,shortcut,apple}` in `app/layout.tsx` (currently all pointing at `/logos/mark-gold.png`) are updated or repointed at new asset paths.
- Check browser tab, bookmark, and iOS/Android "add to home screen" icon rendering manually — no manifest exists today, so add-to-home-screen icon quality depends entirely on the `apple` icon meta tag; confirm it's still present after rebrand.

### Phase 17 — Mobile responsiveness
- Manual pass at common breakpoints (375px, 390px, 768px, 1024px) across: home/marketing pages, enroll funnel, login/portal, HQ dashboard, admin dashboard.
- Specifically re-check any component whose layout depends on brand asset aspect ratio (logo lockups, hero images) since a like-for-like asset swap can silently break responsive sizing if the new asset's dimensions differ from `mark-gold.png`.
- Pass: no horizontal scroll, no clipped/overlapping brand assets, nav/menu remains usable at all breakpoints.

### Phase 18 — Accessibility
- Run axe (or equivalent) against representative pages from each surface: one public page, one auth form, one portal page, one HQ page, one admin page.
- Confirm color contrast holds if the rebrand changes the palette (gold/`#C9A24D` accent appears in agreement PDFs and email templates — check any new brand color choices meet WCAG AA).
- Confirm all renamed images/icons retain meaningful `alt` text (a rebrand that swaps `src` without touching `alt="Catalyst logo"` is a common miss).
- Confirm heading hierarchy and landmark structure weren't disturbed by any copy/component changes bundled into the rebrand.

### Phase 19 — Old-domain redirects
- **Currently there is no redirect infrastructure in this repo** — no `vercel.json`/`vercel.ts`, no redirect logic in `proxy.ts` or `next.config.ts`. If the rebrand branches introduce domain redirects (e.g. `catalystcoachingelite.com` → `kynovant.com`), locate and review that config explicitly (likely a new `vercel.ts`/`vercel.json`, or Vercel project domain settings outside the repo).
- Verify: every old public path (`/`, `/apply`, `/enroll/*`, `/programs`, `/about`, etc.) redirects (301/308, not 302) to the equivalent new-domain path, preserving the path and query string, not just redirecting to the new domain's homepage.
- Verify redirect covers both bare `catalystcoachingelite.com` and `www.catalystcoachingelite.com`.
- If no redirect exists at plan-execution time, this is a **launch blocker**, not a nice-to-have — bookmarks, DocuSign-emailed links, and search results will all point at the old domain at cutover.

### Phase 20 — Hardcoded Catalyst references
- Re-run the full sweep from §1 against the rebrand branch: `grep -rli catalyst . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" --include="*.md"` (excluding `node_modules`/`.git`).
- Triage every hit into: (a) rebranded correctly, (b) intentionally retained (e.g. a changelog entry referencing the old name historically — acceptable), (c) missed — must fix.
- Specifically re-verify the 12 hardcoded-URL locations enumerated in §1's table individually, since these are the ones most likely to cause runtime breakage (wrong email links, wrong webhook origin) rather than just cosmetic leakage.
- Pass: zero category-(c) hits.

### Phase 21 — kynovant.com
- Confirm production deploy resolves at `kynovant.com` (bare domain), serves the app over HTTPS with a valid cert, and that bare-domain requests either serve directly or redirect (308) to whichever of bare/`www` is canonical per the rebrand branch's config.
- Re-run Phases 5–16 (nav, pages, forms, metadata, OG, icons) against this live domain, not just localhost — asset paths, absolute URLs, and OG previews only fully validate against the real host.

### Phase 22 — www.kynovant.com
- Confirm `www.kynovant.com` resolves, serves valid HTTPS, and matches the canonicalization decision from Phase 21 (i.e. one of bare/`www` is canonical and the other 308-redirects to it — don't allow both to serve as separate live origins, which would split SEO and break OG/canonical-URL consistency).
- Re-check every hardcoded `SITE_ORIGIN`/`PROD_WEBHOOK_URL` constant found in §1 uses the correct canonical form (with or without `www`, matching the decision above) — today's code uses `www.` consistently for those three constants, so the replacement should preserve that convention unless the canonicalization decision changes.

### Phase 23 — Old catalystcoachingelite.com compatibility
- Confirm the old domain's DNS/hosting is intentionally kept alive (not deleted) through a defined transition window, per Phase 19's redirect requirement.
- Confirm Stripe's configured webhook endpoint (`app/admin/page.tsx:951` documents the expected prod URL) is updated to the new domain in the Stripe dashboard, but that the old endpoint isn't abruptly deleted before in-flight webhook retries drain — coordinate cutover timing with whoever owns the Stripe dashboard.
- Confirm DocuSign Connect's configured webhook target is likewise updated, with the same drain consideration.
- Confirm any previously-issued (pre-rebrand) agreement PDFs/emails that reference `catalystcoachingelite.com` still resolve correctly for clients who click them after cutover (this is what the redirect in Phase 19 protects) — spot check with a real pre-rebrand agreement link if one exists in a test/sandbox environment.

---

## 4. Exit criteria (sign-off checklist)

- [ ] Phases 1–4 (build/lint/types/tests) green with zero errors
- [ ] Zero unresolved category-(c) hardcoded-Catalyst hits (§20)
- [ ] All 12 known hardcoded-URL locations (§1 table) updated and re-verified individually
- [ ] Old-domain redirect live and verified path-preserving, both bare and `www` (§19)
- [ ] `kynovant.com` and `www.kynovant.com` both verified live with correct canonicalization (§21, §22)
- [ ] Stripe + DocuSign webhook endpoints repointed at new domain, old endpoints scheduled for drain-then-removal, not deleted immediately (§23)
- [ ] Generated agreements (PDF/PDF-clean/DOCX) regenerated and diffed clean across all three generator scripts (§10)
- [ ] Metadata, OG previews, favicon/icons verified both in source and via live link-preview tools (§14–16)
- [ ] Mobile responsiveness and accessibility spot checks pass on representative pages across all four surfaces (public/portal/HQ/admin) (§17–18)

## 5. Out of scope for this plan

- Actually performing the rename (tracked separately in `audit/brand` / `rebrand/app` / `rebrand/docs`).
- External-system brand updates with no repo footprint (DocuSign template branding in DocuSign's own dashboard, Calendly org branding, Google Workspace branding) — flagged for coordination in the relevant phase but not directly testable from this repo.
- Introducing a real automated test framework (Jest/Vitest/Playwright) — noted as a gap in §1 but not this plan's job to fix.

---

*This document will be used to validate the merged rebrand branches once ready. No application code was modified to produce it.*
