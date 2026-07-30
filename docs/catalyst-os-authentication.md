# Kynovant — Authentication

Sprint 5B.2 · Established 2026-07-12

---

## Architecture Overview

Kynovant uses Supabase Auth for session management paired with Drizzle ORM for all coaching data persistence. The two systems share a canonical UUID identity: every `auth.users` row has a matching `public.users` row with the same UUID.

```
Browser
  └─ magic link email → clicks link → /auth/callback
        └─ supabase.auth.exchangeCodeForSession(code)
              └─ session cookie set
                    └─ syncUserToPublic(authUser)     ← Drizzle → public.users
                          └─ redirect to /portal
```

Packages:
- `@supabase/ssr@0.12.0` — cookie-based SSR session management
- `@supabase/supabase-js@2.110.2` — Supabase client library

---

## Auth → Public Identity Mapping

Every Supabase auth user gets a matching `public.users` row with the same UUID. Two mechanisms maintain this mapping:

### Database Trigger (initial creation)

`handle_new_auth_user()` fires `AFTER INSERT ON auth.users`. It inserts into `public.users` with:
- Same UUID
- Email copied verbatim
- `normalized_email` = `lower(trim(email))`
- `role = 'client'` (default; never derived from user_metadata)
- `status = 'invited'` (transitions to 'active' on first login)

The trigger is `SECURITY DEFINER` so it can write to the public schema from the auth schema context. `SET search_path = public` prevents injection.

### Server Sync Helper (lifecycle updates)

`lib/auth/sync.ts:syncUserToPublic()` runs in the auth callback on every login. It:
- Updates email and normalizedEmail if changed
- Sets `emailVerifiedAt` from the auth record
- Transitions `invited → active` on first verified login
- Never overwrites `coach` or `admin` roles — role is excluded from the conflict update
- Never downgrades status from `active`, `suspended`, or `archived`

### Foreign Key

`public.users.id` has a FK to `auth.users.id ON DELETE CASCADE`. If an auth user is hard-deleted (rare, admin-level action), the public record cascades. The RESTRICT FKs from enrollments, profiles, and events prevent this unless all coaching data is removed first.

---

## Invitation-Only Policy

**No public registration.** Access is granted only by the coach creating an auth user in the Supabase dashboard.

The login form uses:
```typescript
supabase.auth.signInWithOtp({
  email,
  options: { shouldCreateUser: false }
})
```

`shouldCreateUser: false` tells Supabase not to create a new `auth.users` row for unknown emails. Supabase silently skips the email send for unknown addresses without returning an error. The UI always shows the same neutral message:

> "If an active Kynovant account exists for this email, a secure sign-in link has been sent."

Account existence is never disclosed.

---

## Login and Callback Flow

```
1. User visits /portal or /account → middleware redirects to /login?next=/portal
2. User enters email → login page calls supabase.auth.signInWithOtp()
3. Supabase sends magic link to email (if account exists)
4. User clicks link → browser hits /auth/callback?code=XXX&next=/portal
5. Callback: exchangeCodeForSession(code) → session cookie set
6. Callback: syncUserToPublic(authUser) → public.users updated
7. Callback: check status → suspended/archived → sign out, redirect to /login?error=access_denied
8. Callback: safeRedirectPath(next) → verified against allowlist → redirect to /portal
```

The `next` parameter allowlist: `/portal`, `/account` (and sub-paths). External URLs, `/api/*`, and any other paths are rejected and replaced with `/portal`.

---

## Session Refresh

`middleware.ts` refreshes expired access tokens via cookie exchange. It runs on:
- `/portal/:path*`
- `/account/:path*`
- `/login`
- `/auth/:path*`

The middleware creates a `createServerClient` with `request.cookies` and calls `supabase.auth.getUser()`. If the access token is expired, Supabase refreshes it using the refresh token and `setAll` writes the new cookies to both the request and the response. This is the official Supabase SSR session refresh pattern for Next.js 15+.

Webhook routes (`/api/stripe/*`, `/api/docusign/*`, etc.) are NOT in the middleware matcher — they are never intercepted or delayed by auth logic.

---

## Route Protection

| Route | Protection | Unauth behavior |
|-------|-----------|----------------|
| `/portal` | Middleware + server check | → /login |
| `/account` | Middleware + server check | → /login |
| `/login` | Public | — |
| `/auth/callback` | Public | Validates code |
| `/portal-preview` | Public (prototype) | — |
| `/mission-entry-preview` | Public (prototype) | — |
| `/api/stripe/*` | `STRIPE_WEBHOOK_SECRET` | Unchanged |
| `/api/docusign/*` | `DOCUSIGN_WEBHOOK_SECRET` | Unchanged |
| `/api/internal/db-health` | `INTERNAL_API_SECRET` bearer | Unchanged |

---

## Role Enforcement

| Role | Access |
|------|--------|
| `client` | `/portal`, `/account` |
| `coach` | (Sprint 5C — not implemented) |
| `admin` | (Sprint 5C — not implemented) |

`requireClientUser()` in `lib/supabase/session.ts` enforces:
1. Active Supabase session (JWT validated with Auth server, not just local cookie)
2. `public.users` row exists
3. Status is not `suspended` or `archived`
4. Status `invited` is allowed — these users have authenticated and will be transitioned to `active` by `syncUserToPublic`

Role grants for `coach` and `admin` happen only through trusted server-side or manual administrative database operations. The trigger, login form, and sync helper never elevate a role based on user-supplied input.

---

## Mission Entry Frequency

Decision: **Once per calendar day**, stored in `localStorage` as a date key.

Key: `catalyst_entry_date`
Value: `new Date().toLocaleDateString('en-CA')` → `YYYY-MM-DD` format using local time zone

Behavior:
- On portal load, client checks if today's date is already in localStorage
- If match → skip entry, go straight to dashboard
- If no match → show entry experience, store today's date on completion

Why localStorage over sessionStorage:
- Clients return daily to a fresh browser session; sessionStorage would show the entry on every browser restart
- A daily coaching ritual should appear once per day, not once per browser open

Why localStorage over a cookie:
- No network overhead on page load
- No server-side cookie logic needed for a pure UX preference

Clearing localStorage resets the entry, which is correct and expected.

**Preview mode** (`/portal-preview`): the `PrototypeControls` component includes scenario switching. The entry always plays in preview because the preview page manages its own phase state independently of the live portal.

---

## Row Level Security

RLS is enabled on all 10 public tables via migration `0001_catalyst_auth.sql`.

### Tables with SELECT policies (client can read their own data)

| Table | Policy | Condition |
|-------|--------|-----------|
| `users` | `users_select_own` | `auth.uid() = id` |
| `client_profiles` | `client_profiles_select_own` | `auth.uid() = user_id` |
| `coaching_enrollments` | `enrollments_select_client_own` | `auth.uid() = client_id` |

### Tables with no permissive policies (deny all browser access)

`coach_profiles`, `external_identities`, `enrollment_events`, `timeline_events`, `drive_workspaces`, `program_templates`, `workout_templates`

**Drizzle ORM (direct Postgres connection via `DATABASE_URL`) bypasses RLS entirely.** All server-side reads and writes in Server Components, Route Handlers, and Server Actions are unaffected by RLS.

RLS only applies to requests going through the Supabase Data API (PostgREST). Since Kynovant does not use PostgREST for data access, RLS acts as a defense-in-depth layer protecting against accidental exposure through the publishable key.

---

## Environment Variables

### Required in `.env.local` and Vercel project settings

| Variable | Scope | Value |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + Server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + Server | Supabase publishable (anon) key |
| `DATABASE_URL` | Server only | Supabase session-mode pooler URL |
| `DATABASE_URL_DIRECT` | Local dev only (migrations) | Supabase direct connection URL |
| `INTERNAL_API_SECRET` | Server only | Random secret for db-health route |

### Must NOT be exposed to the browser

- `DATABASE_URL` — direct Postgres credentials
- `DATABASE_URL_DIRECT` — direct Postgres credentials
- `INTERNAL_API_SECRET` — internal API protection
- Any `STRIPE_*`, `DOCUSIGN_*`, `RESEND_*` keys

The `NEXT_PUBLIC_` prefix makes a variable available in browser bundles. No server secret should ever have this prefix.

---

## Supabase Dashboard Settings

Before the portal is usable, confirm these settings:

**Authentication → Providers → Email:**
- Enable: ON
- Confirm email: ON (magic link)
- Secure email change: ON

**Authentication → URL Configuration:**
- Site URL: `https://kynovant.com`
- Redirect URLs (add both):
  - `https://kynovant.com/auth/callback`
  - `http://localhost:3000/auth/callback`

**Authentication → Settings:**
- "Disable new user signups": leave OFF (new signups are controlled by `shouldCreateUser: false` in code)
- JWT expiry: 3600 seconds (1 hour) recommended for magic link security

**Table Editor → Row Level Security:**
- Confirm all 10 public tables show "RLS enabled" status
- Verify the 3 permissive policies appear on: users, client_profiles, coaching_enrollments

---

## Manual Test Procedure (Sprint 5B.2)

Use a disposable test email you control (e.g. jermaine2417+test@gmail.com).

**Step 1 — Create the auth user in Supabase:**
1. Supabase Dashboard → Authentication → Users → "Add user" → "Create new user"
2. Enter test email address
3. Leave "Auto Confirm User" checked
4. Click "Create User"
5. The database trigger fires → check Table Editor → users → confirm row exists with status 'invited'

**Step 2 — Test magic link login:**
1. Navigate to `http://localhost:3000/login` (start dev server with `npm run dev`)
2. Enter test email → click "Send Secure Sign-In Link"
3. Check inbox (or Supabase Dashboard → Authentication → Users → click user → "Send magic link")
4. Click the magic link → should redirect to `/auth/callback` → then to `/portal`
5. Confirm portal loads with the test email name as greeting
6. Confirm Navbar and Footer are suppressed on /portal

**Step 3 — Verify portal protection:**
1. Open a new incognito window
2. Navigate to `http://localhost:3000/portal`
3. Should redirect immediately to `/login?next=/portal`
4. Log in → should redirect back to `/portal`

**Step 4 — Verify /account:**
1. From /portal, click the client identity section in the sidebar (bottom left)
2. Should navigate to `/account`
3. Confirm name, email, timezone, status fields display
4. Click "Sign out" → should redirect to `/login`

**Step 5 — Verify unknown email behavior:**
1. At `/login`, enter an email address that is NOT in Supabase Auth
2. Submit → UI should show the same "Check your inbox" success state
3. No email should arrive (Supabase silently skips)
4. Confirm the response does NOT say "account not found" or similar

**Step 6 — Verify RLS:**
1. In Supabase SQL Editor, run:
   ```sql
   SET ROLE authenticated;
   SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000000"}';
   SELECT * FROM public.users;
   ```
   Should return 0 rows (no user with that UUID).

**Step 7 — Verify portal-preview still works:**
1. Navigate to `http://localhost:3000/portal-preview`
2. Mission Entry should play (prototype mode, no auth required)
3. Prototype Controls should appear
4. All scenarios should switch correctly

**Cleanup:**
- Delete the test auth user from Supabase Dashboard → Authentication → Users
- Do NOT commit test credentials to Git

---

## Future: Coach and Admin Invitation Flow

Not implemented in Sprint 5B.2. Planned approach:

1. Admin uses Supabase Dashboard → Authentication → Users → "Invite user"
2. User receives invitation email, clicks link → /auth/callback
3. Callback creates `public.users` row with `role = 'client'` (trigger default)
4. Coach/admin role is assigned manually via SQL or a future admin dashboard:
   ```sql
   UPDATE public.users SET role = 'coach' WHERE email = 'coach@example.com';
   ```
5. Future Sprint 5C: coach and admin portal routes, role-based middleware

---

## Future: Onboarding-to-Auth Invitation Automation

Not implemented in Sprint 5B.2. Planned approach:

1. Stripe webhook fires on successful payment → creates auth user via service role
2. Supabase sends invitation email automatically
3. Client completes onboarding → profile synced to `client_profiles`
4. Client signs in → trigger + sync complete the `public.users` record

This closes the loop between the Stripe payment flow and the portal login without manual dashboard steps.

---

## Files Created in Sprint 5B.2

| File | Purpose |
|------|---------|
| `lib/supabase/client.ts` | Browser Supabase client (`createBrowserClient`) |
| `lib/supabase/server.ts` | Server Supabase client (`createServerClient` + async cookies) |
| `lib/supabase/session.ts` | `requireUser`, `requireClientUser`, `getClientProfile`, `signOutCurrentUser` |
| `lib/auth/sync.ts` | `syncUserToPublic`, `getPublicUser` — lifecycle sync |
| `middleware.ts` | Session refresh + /portal and /account protection |
| `app/login/page.tsx` | Invitation-only magic link login page |
| `app/auth/callback/route.ts` | Auth code exchange, user sync, safe redirect |
| `app/portal/page.tsx` | Protected real portal (Server Component) |
| `app/account/page.tsx` | Protected account page with logout |
| `components/portal/PortalDashboard.tsx` | Client Component wrapping entry + dashboard |
| `components/portal/LiveMissionBriefing.tsx` | Generic briefing (no hardcoded scenario copy) |
| `components/portal/LogoutButton.tsx` | Client logout button → supabase.auth.signOut() |
| `drizzle/0001_catalyst_auth.sql` | FK, trigger, RLS migration (not yet applied) |
| `docs/catalyst-os-authentication.md` | This document |

## Files Modified in Sprint 5B.2

| File | Change |
|------|--------|
| `components/Navbar.tsx` | Added /login, /auth/*, /account to suppression list |
| `components/Footer.tsx` | Added /login, /auth/*, /account to suppression list |
| `components/portal/PortalSidebar.tsx` | Client identity section → Link to /account |
| `.env.local.example` | Added NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY |
| `drizzle/meta/_journal.json` | Added 0001_catalyst_auth entry |
