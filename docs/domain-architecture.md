# Domain Architecture — Kynovant vs. Catalyst Coaching Elite

**Status:** Implemented. This document is the reference for how two
separate businesses are served from one Next.js codebase, split by
domain.

## The two businesses

- **kynovant.com** — Kynovant SaaS. Software homepage, features,
  pricing, self-service coach trial signup, legacy coach application,
  login, HQ (coach workspace), and client portal. This is the active,
  growing product.
- **catalystcoachingelite.com** — Catalyst Coaching Elite, Jermaine's
  personal physique-coaching business. Biography, coaching programs,
  personal coaching application, enrollment/payment pages. **Dormant**,
  not deleted — its marketing and payment funnel must keep working
  exactly as it does today.

Both are served from this one repository/deployment. There is one
Postgres database, one Supabase Auth instance, one Next.js build — the
split happens entirely at the routing layer (`proxy.ts`), not by
duplicating infrastructure. See "Why one codebase, one auth system"
below.

## Route ownership map

| Path | Domain | Notes |
|---|---|---|
| `/` | **Both — different content** | Rewritten/redirected per domain. Catalyst domain: redirected to `/about` so the dormant personal-coaching domain never renders the Kynovant SaaS homepage. Kynovant domain: rewritten (not redirected — URL bar stays `/`) to `/home` (`app/(kynovant)/home/page.tsx`), the redesigned Kynovant SaaS homepage. (Prior to the homepage redesign, this rewrote to `/for-coaches` instead — see git history if that context is ever needed.) |
| `/about`, `/programs` | Catalyst | Unchanged, untouched. |
| `/apply` | Catalyst | Jermaine's personal coaching-client application. Reverted to its original GAS-direct submission in a prior change — never touches the `applications` table. |
| `/enroll/*`, `/onboarding`, `/onboarding-complete`, `/executive-onboarding`, `/executive-performance-confirmed`, `/payment-confirmed`, `/thank-you` | Catalyst | Enrollment/payment funnel. Untouched. |
| `/home` | Kynovant | **New.** The actual Kynovant homepage content — exists as its own route because Next.js route groups can't both own `/` (see the `/` row above). Not meant to be linked directly; reached via the `/` rewrite. |
| `/for-coaches` | Kynovant | Redirects to `/` — its content (the old `EnrollmentPage`-based pitch, gold/black Catalyst-styled) is now superseded by `/home`. Kept as a route only because it's still linked from `app/(site)/page.tsx` and listed below in `KYNOVANT_ONLY_PREFIXES`. |
| `/start-trial` | Kynovant | Public self-service signup route for new coaches. Posts to `POST /api/coach-signup`, sends the Supabase invite/setup email, and does not create a Stripe customer or subscription before authenticated trial activation. |
| `/coach-apply` | Kynovant | Legacy/inbound application route. Posts to `POST /api/applications` (unchanged). Preserved, but not the primary acquisition funnel. |
| `/features`, `/pricing` | Kynovant | Real public buyer pages. `/features` summarizes shipped product capabilities and claim boundaries. `/pricing` states Kynovant Professional at $99/month with a 14-day free trial. |
| `/login`, `/forgot-password`, `/reset-password`, `/setup-password`, `/account-status`, `/auth/*` | Kynovant | Kynovant-branded authentication and account-status flow. `/account-status` is the authenticated post-setup gate where coaches explicitly activate the Stripe trial. |
| `/hq/*` | Kynovant | Coach workspace. |
| `/portal/*` | Kynovant | Client portal. |
| `/account` | Kynovant | |
| `/admin/*` | Kynovant | Includes the legacy ops dashboard (`/admin`) and `/admin/growth/applications` (Kynovant coach-application review). |
| `/api/*` | **Neither — always reachable** | Never domain-gated. Webhooks (Stripe, DocuSign) and internal APIs don't carry a browser `Host` a visitor controls in any meaningful sense, and gating them would break Stripe/DocuSign delivery. Each webhook already knows which business it serves — see "Fixed cross-brand references" below. |
| `/dev-preview/*`, `/portal-preview`, `/mission-entry-preview` | Neither — unaffected | Dev/preview tooling, out of scope for this split, not gated either direction. |

## Why `/for-coaches`, `/coach-apply`, `/login` etc. didn't already leak Catalyst nav

Before this change, `/for-coaches` and `/coach-apply` lived inside
`app/(site)/`, so they inherited `app/(site)/layout.tsx`'s `<Navbar>`/
`<Footer>` — Catalyst's shared chrome (About / Programs / Apply links,
"Kynovant provides physique coaching..." footer copy). That's the
concrete bug this task fixes for those two routes.

`/login`, `/hq`, `/portal`, `/account`, `/admin`, `/auth/*` were never
affected by this — they're top-level route folders (`app/login/`,
`app/hq/`, etc.), not inside `app/(site)/`, so they never rendered
Catalyst's Navbar/Footer at all. They already had their own dedicated
shells (HQShell, PortalShell, or bare centered auth layouts). Verified
by direct grep before making any change — no stray Catalyst links
existed in `components/hq/`, `components/portal/`, `app/login/`,
`app/account/`, or `app/admin/`.

## What's genuinely new vs. reused

- **New:** `app/(kynovant)/layout.tsx`,
  `components/kynovant/KynovantNavbar.tsx`,
  `components/kynovant/KynovantFooter.tsx` — a real, separate nav
  surface (Features / AI Programming / Pricing / Login), with no Catalyst
  links, as required.
- **New:** `/features`, `/pricing`, and `/start-trial` are real
  Kynovant public routes. `/features` uses audited product-truth
  content, `/pricing` presents the launch plan, and `/start-trial`
  starts the self-service coach signup flow.
- **Reused, untouched:** `components/EnrollmentPage.tsx` still supports
  Catalyst's `/enroll/*` pages. `/for-coaches` no longer renders it;
  the route redirects to the redesigned Kynovant homepage.
- **Reused, untouched:** `components/Navbar.tsx`, `components/Footer.tsx`,
  and every page under `app/(site)/` — see "Known remaining
  cross-brand reference" below for the one thing this leaves
  unresolved.

## Middleware / domain logic (`proxy.ts`)

Two concerns, kept separate for performance:

1. **Domain routing** — cheap hostname + pathname string checks, no
   Supabase call, runs on every page request (the matcher now covers
   all pages, not just protected ones):
   - `kynovant.com` + `/` → **rewrite** (not redirect — URL stays `/`)
     to `/home`.
   - `catalystcoachingelite.com` + `/` → **308 redirect** to `/about`
     on `catalystcoachingelite.com`.
   - `kynovant.com` + a Catalyst-only path → **308 redirect** to the
     same path on `catalystcoachingelite.com`.
   - `catalystcoachingelite.com` + a Kynovant-only path → **308
     redirect** to the same path on `kynovant.com`.
   - Any other host (localhost, `*.vercel.app` previews) → no gating,
     every route reachable, exactly as before this change. Add
     `?__brand=kynovant` or `?__brand=catalyst` to the URL to preview
     either domain's routing behavior without real DNS.
2. **Auth session refresh + protected-path enforcement** — explicitly
   scoped to only `/portal`, `/account`, `/account-status`, `/hq`,
   `/admin`, `/login`, `/auth/*` (`AUTH_RELEVANT_PATHS`) even though
   the outer matcher is broader, so marketing-page views don't pay for
   a Supabase round-trip they don't need.

**Choice made for requirement "redirect safely... OR return a
deliberate not-found page":** this implementation always redirects.
A 404 was considered and rejected — Catalyst is dormant, not retired,
and a visitor hitting `kynovant.com/apply` (an old bookmark, a stale
link) is far better served landing on the real Catalyst page than a
dead end. If Catalyst is ever fully retired, swapping the redirect
branch for a `notFound()` call is a small, isolated change.

## Environment variables

| Variable | Purpose | Default if unset |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Kynovant base URL (existing var, unchanged) | `https://kynovant.com` |
| `NEXT_PUBLIC_CATALYST_URL` | **New.** Catalyst base URL | `https://www.catalystcoachingelite.com` |

Both are read by `proxy.ts` for cross-domain redirect targets, and by
the two webhook handlers below for building correct-domain links. See
`env.local.example` for the full comment block on each.

## Fixed cross-brand references (requirement: emails/redirects/OAuth/Stripe/DocuSign/Calendly use the correct domain)

| File | Was | Now | Why |
|---|---|---|---|
| `app/api/stripe/webhook/route.ts` | `SITE_ORIGIN = "https://www.kynovant.com"` | `NEXT_PUBLIC_CATALYST_URL` (fallback `catalystcoachingelite.com`) | This webhook handles Catalyst client payments only (coaching packages) — no Kynovant coach-billing integration exists. It builds onboarding links to `/onboarding` and `/executive-onboarding`, both Catalyst-only pages. |
| `app/api/docusign/webhook/route.ts` | `SITE_ORIGIN = "https://www.kynovant.com"`, footer text `www.kynovant.com` | Same, → `catalystcoachingelite.com` | DocuSign handles the Catalyst client coaching agreement; `enrollPath` always resolves to `/enroll/*` (`lib/enrollment.ts`), a Catalyst-only path. |
| `app/admin/page.tsx` | `PROD_WEBHOOK_URL` display constant → kynovant.com | → catalystcoachingelite.com | Diagnostics-only display string; now matches the actual registered webhook domain. |
| `app/api/admin/coaches/route.ts`, `app/api/internal/clients/route.ts`, `app/api/applications/route.ts` | kynovant.com fallback | **Unchanged** | Already correct — coach invites, HQ client creation, and coach-application admin review are all Kynovant-only. |
| Calendly (`components/CalendlyEmbed.tsx`, `/thank-you`) | `calendly.com/catalyst-coaching-headcoach/...` | **Unchanged** | Already correctly Catalyst-scoped (the slug itself says so) and lives entirely on Calendly's own domain — nothing to fix. |
| `/auth/callback`, `/auth/role-redirect` | Build origin from `request.url` dynamically | **Unchanged** | Already domain-correct by construction; Kynovant-only via proxy gating; Supabase Auth's Site URL/redirect allowlist is already configured for kynovant.com. |

## Known remaining cross-brand references (not fixed — out of scope)

Two categories of "Kynovant" branding still appear where the *content*
belongs to Catalyst. Both were left alone deliberately, because fixing
them means rewriting Catalyst-facing copy/branding, which the "do not
redesign or improve Catalyst Coaching" constraint puts out of scope —
domain **routing** was corrected; domain **branding/copy** was not:

1. **`components/Navbar.tsx` / `components/Footer.tsx`** (Catalyst's
   own shared chrome) still show the Kynovant logo and "Kynovant
   provides physique coaching..." copy. These render on every
   `app/(site)/*` page. Root cause: an earlier, now-being-corrected
   rebrand applied the Kynovant name to what was originally Catalyst
   Coaching's own site chrome, and reverting that is a content/design
   change, not a routing fix.
2. **`app/api/stripe/webhook/route.ts`'s email templates** (welcome
   email + admin payment notification) — sender display name, subject
   lines, and in-email copy all say "Kynovant," even though these
   emails go to Catalyst coaching clients. The functional URLs inside
   them were fixed (see table above); the brand copy was not, for the
   same reason as #1.
3. **Root `app/layout.tsx`** metadata (`title`, `metadataBase`,
   `openGraph`) is Kynovant-flavored and inherited by every
   `app/(site)/*` page that doesn't override it (none currently do).
   `app/(kynovant)/layout.tsx` has its own correct metadata for the
   Kynovant route group; Catalyst pages still inherit the root's.

None of these affect **routing correctness** — a visitor always ends
up on the right domain for the right business. They affect **brand
consistency** on pages this task was explicitly told not to redesign.
Flagging here so it's a known, disclosed gap rather than a silent one.

## Why one codebase, one auth system (requirement: don't duplicate auth infrastructure)

Catalyst Coaching Elite has never had its own login/auth — `/apply`
and `/enroll/*` are unauthenticated marketing forms backed by Stripe
Checkout and a Google Apps Script mirror, not a session system. There
is nothing to "duplicate" on the Catalyst side. All real authentication
(Supabase Auth, `public.users`, roles, `/login`, `/hq`, `/portal`) is
Kynovant-only and stays exactly as it was — this task didn't add a
second auth system, and doesn't need to.

## Local development

Unaffected by default: on `localhost`, `resolveBrand()` in `proxy.ts`
returns `null` (unrecognized host) and no domain gating applies —
every route is reachable exactly as before this change, satisfying
"preserve local development support" without any special dev
configuration. To specifically test either domain's behavior locally,
append `?__brand=kynovant` or `?__brand=catalyst` to any URL.

## Vercel actions required (manual, not done by this change)

1. **Add the second domain to the Vercel project.** This deployment
   currently has `kynovant.com` attached (per `app/layout.tsx`'s
   existing `metadataBase`). Add `catalystcoachingelite.com` (and
   `www.catalystcoachingelite.com`) as an additional domain on the
   **same** Vercel project — both domains need to resolve to this one
   deployment for `proxy.ts`'s hostname check to see real traffic on
   either.
   - Vercel Dashboard → Project → Settings → Domains → Add.
   - Update DNS for `catalystcoachingelite.com` to point at Vercel
     (A/CNAME per Vercel's instructions) if it isn't already.
2. **Set environment variables** (Project → Settings → Environment
   Variables, Production + Preview):
   - `NEXT_PUBLIC_SITE_URL=https://kynovant.com`
   - `NEXT_PUBLIC_CATALYST_URL=https://www.catalystcoachingelite.com`
3. **Update the Stripe webhook endpoint** (Stripe Dashboard →
   Developers → Webhooks) to `https://www.catalystcoachingelite.com/api/stripe/webhook`
   if it is currently registered against kynovant.com — confirm the
   actual registered URL; this document assumes it needs correcting
   based on the code found, not confirmed against the live Stripe
   dashboard.
4. **Update the DocuSign Connect webhook / signer-role configuration**
   the same way, if it references kynovant.com anywhere in the
   DocuSign portal itself (template branding, Connect webhook URL).
5. **Supabase Auth Site URL / redirect allowlist**: no change needed —
   already scoped to kynovant.com, and `/auth/*` stays Kynovant-only.
6. Confirm both domains' SSL certificates provision correctly in
   Vercel after step 1 (automatic, but verify).

None of steps 1–4 can be performed from this repository — they require
dashboard access to Vercel, Stripe, and DocuSign respectively.
