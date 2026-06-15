# Codebase Audit — clubflow-buddy (TableFlow)

**Date:** 2026-06-15
**Scope:** Every route, component, hook, lib module, Supabase migration, and Edge Function.
**Stack:** TanStack Router SPA (React 19) + Supabase (Postgres RLS is the entire security boundary — there is no server API layer).

> **Status: documentation only. Nothing has been fixed.** This file is a prioritized inventory of bugs, security issues, incomplete implementations, missing error handling, UX problems, and UI issues. Severities: **Critical / High / Medium / Low**.

## Executive summary

The **RLS security model is sound**. Tenant tables were dropped and rebuilt with `team_id`, every policy is scoped via `SECURITY DEFINER` helpers (`is_team_member`, `is_team_admin`, `can_access_event`) that set `search_path`, secrets in `team_settings` are admin-only, invite tokens are 192-bit random with enforced expiry, and the two privileged RPCs (`create_team`, `accept_invite`) gate on `auth.uid()`. No cross-tenant data leak or auth bypass was found at the database layer. The early permissive `USING (true)` policies from the first migration are gone (their tables were `DROP ... CASCADE`d).

The **main risks are on the client**: app-hangs and error-masking in the team/session hooks, non-idempotent realtime status mutations (lost updates with concurrent staff), a write path that bypasses the Zod validation layer, and business-value integrity (totals/prices are client-computed and writable by any assigned staff — RLS validates *access*, not *values*). There is also no automated test coverage and no use of the installed react-query cache (every screen refetches manually, so views go stale relative to each other).

No **Critical** issues were found. The list below starts at High.

---

## HIGH

### H1 — App hangs in "loading" forever after logout
- **Category:** Bug · **File:** `src/hooks/use-current-team.ts:71-73, 96`
- When `user` becomes `null` (logout/session loss) the effect sets `status = "loading"` and returns, and the derived return (`!user && status === "loading" ? "loading"`) then reports `loading` indefinitely. Any screen gated on `status !== "loading"` (settings, whatsapp, etc.) hangs on the spinner instead of resolving or redirecting.

### H2 — Transient query errors are masked as "no team" → real members pushed to onboarding
- **Category:** Bug / Error handling · **Files:** `src/hooks/use-current-team.ts:42-46`, `src/routes/_authenticated/route.tsx:14-22`
- `fetchTeam` treats any query error as `status = "no_team"`. The `_authenticated` guard treats an empty/failed `team_members` query identically to "genuinely has no team" and force-redirects to `/onboarding`. A network/RLS hiccup therefore drops an existing member into the team-creation funnel.
- Compounding: the guard exempts `/onboarding` from the membership check (`route.tsx:12`), so an existing member who lands there can create a **duplicate team**. Onboarding never checks for existing membership.

### H3 — `advance()` is non-idempotent → lost updates with concurrent staff
- **Category:** Bug / Race · **Files:** `src/routes/_authenticated/board.tsx:127-144`, `src/routes/_authenticated/table.$id.tsx:96-114`
- Next status is computed from a local snapshot and written with no optimistic-concurrency guard (no `.eq("status", currentStatus)`). Two staff advancing the same table near-simultaneously both read the same status and both write, skipping a step or clobbering `assigned_to`. The follow-up "resolve alert" update's error is swallowed; in `table.$id.tsx` the alerts update even runs after the primary update failed (no early return).

### H4 — Event edit save bypasses the validation layer
- **Category:** Bug / Data integrity · **File:** `src/routes/_authenticated/event.$id.tsx:43-52`
- `save()` writes `name/date/headliner/...` straight to `supabase.from("events").update(...)` instead of going through `createEvent`'s Zod schema (which enforces `min(2)`, length caps, date format). An empty or 5000-char name/notes is persistable. RLS permits it (admin editing own-team event), so only the DB column types catch anything.

### H5 — Business values (totals, prices) are client-computed and client-written with no server validation
- **Category:** Security (integrity) · **Files:** `src/components/CheckinSheet.tsx:63-97`, `src/components/ReorderSheet.tsx:44-75`, `src/routes/_authenticated/board.tsx`, `table.$id.tsx`
- Because "security is enforced entirely by RLS" and RLS only checks *event access*, any assigned staff can POST arbitrary `total`, `total_amount`, `price_actual`, and `people_count` values. This silently corrupts revenue and the entire analytics dashboard, and is not detectable from the data. There is no DB-side `CHECK`/trigger validating that order totals match line items.

---

## MEDIUM

### M1 — Twilio webhook signature validation likely never succeeds (silently relies on fallback secret)
- **Category:** Bug / Security · **File:** `supabase/functions/whatsapp-webhook/index.ts:68-83`
- The HMAC-SHA1 signature is computed over `req.url`. Behind the Supabase Edge proxy `req.url` rarely matches the public URL Twilio actually signed, so `expected === twilioSignature` fails and auth falls through to the `x-webhook-secret` path. Twilio does not send that header unless manually configured, so a "signature-only" setup would reject all real messages (or, if the secret path is misconfigured, accept too much). Validate against the configured public URL.

### M2 — Twilio auth token and webhook secret are shipped to the browser
- **Category:** Security · **Files:** `src/lib/team.functions.ts:338-353` (`getTwilioSettings`), `src/routes/_authenticated/settings.whatsapp.tsx:33,221`
- `getTwilioSettings` selects `twilio_auth_token` and `webhook_secret` and returns them to the client; the page renders the auth token into a password input's `value` (present in the DOM) and the webhook secret as plaintext. Admin-only via RLS, but these should be write-only: an admin's compromised/over-the-shoulder browser leaks the live Twilio credential. Consider never returning the token (store-and-forget) and showing only a masked indicator.

### M3 — Realtime INSERT handler appends duplicate cards
- **Category:** Bug / Race · **File:** `src/routes/_authenticated/board.tsx:88-95`
- On a realtime `INSERT` the handler does `[...prev, payload.new]` with no existence check, so an echo for a row already present from the initial `load()` (or a double event) appends a duplicate table card. (Contrast `AlertsBanner.tsx:70-77`, which correctly dedupes by id.)

### M4 — Late-bottle alert can be inserted multiple times across devices
- **Category:** Bug / Race · **File:** `src/routes/_authenticated/board.tsx:103-120`
- The "bottle late" auto-alert guard is a per-client `ref` + a non-atomic select-then-insert. Two devices viewing the board both pass the empty select and both insert a `bottle_late` alert. Fire-and-forget `late.forEach(async …)` has no error handling.

### M5 — Signup navigates to a protected route even when email confirmation is required
- **Category:** UX / Bug · **File:** `src/routes/auth.tsx:38-43`
- On signup the code toasts "Accesso in corso…" and `navigate({ to: "/board" })` immediately. If email confirmation is enabled, `signUp` creates no session, so the user is bounced straight back to `/auth` with no "check your email" state. `invite.$token.tsx` handles `!data.session` correctly; this route does not.

### M6 — Invite auto-accept can fire more than once / email-confirmation return path may not auto-accept
- **Category:** Bug / UX · **File:** `src/routes/invite.$token.tsx:37-75, 58, 105-111`
- The mount effect calls `tryAccept()` directly (deps disabled) and `submit()` calls it again after sign-in, while the root `onAuthStateChange` invalidates queries on `SIGNED_IN` — the accept can run repeatedly. Impact is limited because `accept_invite` is idempotent (`used_at` guard), but error handling is duplicated/inconsistent. Separately, the email-confirmation `emailRedirectTo` promises auto-accept on return, but that only works if a session already exists; `detectSessionInUrl`/PKCE is not configured in `client.ts`, so the promised auto-accept may silently not happen.

### M7 — No use of react-query; every view refetches manually and goes stale
- **Category:** Architecture / Bug · **Files:** all routes (`events.tsx`, `board.tsx`, `event.$id.tsx`, `table.$id.tsx`, `analytics.tsx`, settings)
- `@tanstack/react-query` is installed and a `QueryClient` is provided, but every screen uses `useState` + ad-hoc `load()`. There is no shared cache or cross-view invalidation: a mutation in one view never updates another, navigation refetches everything, and there is no optimistic UI. `events.tsx:31-41` in particular has no refetch-on-focus/realtime, so the event list (and its single "active" highlight) shows stale data after another admin changes it.

### M8 — Widespread swallowed query errors → failures look like empty states
- **Category:** Error handling · **Files:** `events.tsx:31-40`, `board.tsx:67-82`, `event.$id.tsx:299-303,354-358,411-419`, `analytics.tsx:43-56`, `CheckinSheet.tsx:36-41`, `ReorderSheet.tsx:27-32`, `FormatSelect.tsx:23-27`, `use-active-event.ts:23-31`, `use-session.ts:11-15`
- These all destructure only `data` and ignore `error`. A failed fetch renders "no events / no tables / empty list / no active event" indistinguishably from a real empty result. In analytics, a partial failure silently computes charts against incomplete data. `use-session`'s `getSession().then(...)` has no `.catch`, so a rejection leaves `loading` stuck `true` forever.

### M9 — No confirmation + no team scoping on event archive; destructive actions use blocking native `confirm()`
- **Category:** UX · **Files:** `event.$id.tsx:64-69`, `events.tsx:56`, `settings.whatsapp.tsx:96`, `settings.team.tsx:102`, `FormatSelect.tsx:46`
- `archive()` runs immediately with no confirmation and `eq("id", …)` only; a misclick removes the active event from the board with no undo. Elsewhere destructive actions use the blocking, off-brand native `confirm()`/`window.confirm`.

### M10 — Race conditions in async hooks (no request cancellation)
- **Category:** Bug / Race · **Files:** `use-current-team.ts:35-67`, `use-active-event.ts:21-32`
- `fetchTeam`/`fetchEvent` have no sequence guard or AbortController; rapid team switches (`TEAM_CHANGED_EVENT`) can resolve out of order and apply a stale team/event (last-resolved-wins). `use-active-event` also never clears a stale `event` when the team leaves `ready`.

### M11 — Duplicate-insert / no in-flight guard on `event_members` toggle and alert buttons
- **Category:** Bug / UX · **Files:** `event.$id.tsx:190-202`, `table.$id.tsx:116-137, 287-298`, `events.tsx:43-52,136`
- Toggling staff assignment inserts without handling a duplicate-key race (unique `(event_id,user_id)`), and quick-request / "segnala problema" / "Attiva" buttons have no disabled-while-pending state, so repeated taps fire duplicate mutations / spam alerts.

---

## LOW

### Bugs / logic
- **L1** `src/lib/bottle-calc.ts:102` — the upsell cap `if (total > maxExtra * 1000)` is 1000× too large (`maxExtra` is €200, compared against 200000), so it never triggers; the only effective cap is the `extraTotal <= max(50, required*0.3)` check at line 122. Dead guard.
- **L2** `src/routes/_authenticated/table.$id.tsx:180-183` — `STATUS_ORDER` omits `checkin`, so `indexOf("checkin")` is `-1` and the stepper highlights nothing for a table mid-check-in.
- **L3** `src/routes/_authenticated/table.$id.tsx:129-137` — all four quick requests and the generic help button insert `kind: "help_needed"`, differing only by free text, so alerts can't be categorized/deduped/analyzed by kind.
- **L4** `src/routes/_authenticated/table.$id.tsx:156` vs `board.tsx:244` — table detail shows `orders.reduce(...)` while the board shows the persisted `total_amount` column; the two independently-computed totals can disagree.
- **L5** `src/routes/_authenticated/analytics.tsx:378` — `PerHeadliner` filter `r.name !== "—" || r.Eventi > 0` is a tautology (every "—" group has `Eventi > 0`); it never drops anything.
- **L6** `src/routes/_authenticated/analytics.tsx:158-166` — trend chart keys the X axis on the formatted date label ("02 giu"), so two events on the same day collide.
- **L7** `src/routes/_authenticated/event.$id.tsx:71-77` — delete only removes the `events` row and trusts an unstated FK cascade for tables/bottles/orders; if cascade isn't configured it errors or orphans rows.
- **L8** `src/components/CheckinSheet.tsx:144-149` — the "servono €X a testa in più" hint math (`max(0, cheapest.price - delta)/people`) is misleading when a shortfall already exists.
- **L9** `src/hooks/use-session.ts:16-18` & `use-current-team.ts:53,62,87` — listener `setSession` has no `mounted` guard; direct `window.localStorage`/`dispatchEvent` with no `typeof window` guard (throws under any SSR/prerender; inconsistent with `onboarding.tsx`).

### Security (low / defense-in-depth)
- **L10** Detail routes fetch by `id` only and rely entirely on RLS for tenant isolation (`event.$id.tsx:36-40`, `table.$id.tsx:60-63`, `board.tsx` realtime). RLS (`can_access_event`) **does** cover this, and the `validate_team_event_relations` trigger blocks cross-team writes — so this is not exploitable, but the client never uses the available `teamId` as a defense-in-depth filter.
- **L11** `supabase/migrations/20260615120000_spa_client_rpcs.sql:12` (`create_team`) — any authenticated user can create unlimited teams (and becomes admin of each). No rate limit → spam/DoS vector.
- **L12** `whatsapp-webhook/index.ts:96-106` — table matching uses the last-9-digits suffix (`endsWith`), which can false-match two customers; and there is no idempotency, so Twilio retries create duplicate `whatsapp_msg` alerts.
- **L13** `supabase/functions/twilio-test/index.ts:55-56` — returns the raw Twilio error body (sliced to 200 chars) to the client; minor info disclosure (admin-only).
- **L14** `profiles_select_same_team_or_self` (migration `20260613114851`) lets any team member read co-members' email/display_name directly via the API. The UI gates member management to admins, but RLS does not — acceptable for a team app, noted for completeness.

### UX / UI / accessibility
- **L15** `src/routes/_authenticated/route.tsx:7` & `auth.tsx:125-127` — redirect to `/auth` doesn't preserve the requested location (always lands on `/board` after login); the "Torna alla board" link on the auth page points at a protected route and loops back.
- **L16** `src/routes/index.tsx:4-6` & `__root.tsx:55-60` — `/` → `/events` → `/auth` double-redirect for unauthenticated users; the error boundary mixes a raw `<a href="/">` (full reload) with router navigation.
- **L17** `src/routes/_authenticated/events.tsx:79` — `<TeamSwitcher />` (interactive button) is rendered inside an `<h1>`; invalid/confusing heading semantics for screen readers.
- **L18** `src/routes/_authenticated/settings.whatsapp.tsx:194-212` — the webhook **URL** field is wrapped in `sr-only` (hidden) while the copy button remains, so admins can't see/copy the URL the help text tells them to configure.
- **L19** `src/components/CheckinSheet.tsx:164-167`, `ReorderSheet.tsx:95-97`, `event.$id.tsx:338,392`, `board.tsx:244` — prices/totals render raw numbers (`€{b.price}`, `€12.5`) without consistent `toFixed(2)` currency formatting.
- **L20** `src/components/AlertsBanner.tsx:123` — `sticky top-[112px]` is a hardcoded magic offset coupled to header height; brittle if the header changes.
- **L21** `src/routes/_authenticated/onboarding.tsx:36-46, 76-79` — `teamId` lives only in component state, so a reload on step 2/3 silently no-ops the invite step; `signOut` has no try/catch and navigates to `/auth` even if sign-out failed.
- **L22** `src/__root.tsx:77-84` — `onAuthStateChange` calls `queryClient.invalidateQueries()` (all queries) + `router.invalidate()` on `SIGNED_IN`/`USER_UPDATED`, which can fire on tab refocus/session-restore and cause refetch storms.

### Incomplete / dead code
- **L23** `src/routes/_authenticated/config.tsx:1-7` — route is a redirect-only stub to `/events` with no component; confirm whether `/config` should exist or be removed.
- **L24** Italian UI strings are hardcoded throughout (no i18n layer). Not a bug; noted as a consistency/scope item.
- **L25** No automated tests exist anywhere in the repo, and there are no per-route error boundaries beyond the single root `ErrorComponent`.

---

## Notes on what was verified as *correct* (not issues)
- RLS is enabled on every tenant table; no leftover `USING (true)` data-table policies (their tables were `DROP ... CASCADE`d in migration `20260610014618`).
- `create_team` / `accept_invite` are `SECURITY DEFINER` with `SET search_path`, gate on `auth.uid()`, and validate token/expiry/prior-use. Invite tokens are `gen_random_bytes(24)` (192-bit) — not enumerable.
- `team_settings` (Twilio secrets) is admin-only for SELECT/INSERT/UPDATE.
- A partial unique index (`events_one_active_per_team_idx`) enforces "one active event per team" at the DB level, backstopping the `activateEvent` archive/activate race.
- `can_access_event` correctly grants team admins access without an explicit `event_members` row, matching the "admins always have access" UI assumption.
- `bestComboUnderBudget` (bottle-calc DP knapsack) logic is correct.

---

## Suggested fix order
1. **H1, H2** — unbreak logout and stop masking errors as "no team" (these cause user-visible hangs and wrong redirects).
2. **H3** — add `.eq("status", current)` optimistic-concurrency guards to `advance()`.
3. **H4, H5** — route writes through the Zod layer and add DB-side `CHECK`/trigger validation of totals.
4. **M1, M2** — fix webhook signature URL handling; make Twilio secrets write-only.
5. **M3, M4, M8, M10, M11** — dedupe realtime inserts, make alert inserts idempotent, surface query errors, add request-cancellation and in-flight button guards.
6. Adopt react-query for caching/invalidation (**M7**) and work through the Low list.
