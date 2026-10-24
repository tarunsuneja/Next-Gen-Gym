# Gymdesk — Product & Build Plan

Market-standard functional flows and the build roadmap for turning the current MVP
into a production-grade gym management tool for **one gym (NGF)**, packaged so it can
later be sold to a handful of client gyms.

**Status:** approved scope · largely implemented · last updated: 2026-10-15

> **Implementation note (2026-10-15):** Phases 1–4 have landed. The work shipped as
> migrations `006_whatsapp_reminders`, `007_staff_audit_admin` (staff admin, plan/member
> deletion, early expiry, audit trail), `008_lifecycle_integrity` through
> `012_attendance_checkout`, Cloudflare Pages Functions under `functions/api/whatsapp/`,
> and new UI in `src/Admin.tsx` (Staff & access, Audit) and `src/Messaging.tsx`
> (templates, rules, queue, log). Freeze/Resume/Due-date profile buttons were replaced
> by the **Edit membership** modal (pause cleared on save); Cancel membership and
> End access remain profile actions. Remaining work is in §13 and §14.

---

## How to read this document

| Tier             | Meaning                                                  |
| ---------------- | -------------------------------------------------------- |
| 🟢 **BUILD NOW** | In scope for this pass — designed and ready to implement |
| 🟡 **LATER**     | Designed now, built in a later phase (listed in §13)     |
| ⛔ **OUT**       | Deliberately not doing for the single-gym goal           |

### Locked decisions

| Decision                   | Choice                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| Member deletion            | Hard-delete **only** when the member has zero history; otherwise **Archive** (owner-only delete) |
| "Expire the user"          | **Force-end membership** (owner + reason ≥5 chars + audit)                                       |
| Plan deletion              | **Delete with usage warning** (past records keep the plan name)                                  |
| Admin / Staff portals      | **Role-based navigation + dashboards** (no URL routing yet — routing stays a later phase)        |
| Staff management UI        | **Included** (enable/disable + provisioning helper)                                              |
| Work order                 | **Safety-net commit first → features → hardening**                                               |
| Deployment target          | Cloudflare Pages + Supabase · money = integer paise · timezone Asia/Kolkata                      |
| Future features (priority) | WhatsApp Cloud API automation, QR/biometric attendance                                           |

---

## 1. Roles & Portals (Admin / Staff)

**Current state:** one shell; all 8 nav pages visible to everyone (`src/App.tsx:85-94`);
content gated block-by-block with `role === "owner"`; labels "Owner/Reception";
staff accounts created by manual SQL (`supabase/provision-gym.sql` commented example);
`role` state defaults to `"owner"` (`src/App.tsx:222`) so a receptionist briefly sees
owner-only UI.

**Market standard** (Gyms24 "1 admin + N staff", GymSupport role-scoped access):

```
Sign in → fetch my_role() → land on role home

ADMIN: Dashboard · Members · Memberships · Fees & receipts · Attendance
       · Reminders · Reports · Plans · Staff · Settings

STAFF: Dashboard(Today) · Members · Memberships · Fees & receipts
       · Attendance · Reminders
```

### 🟢 Build

1. **Role bootstrap fix** — default `role` to `"unknown"`; hide all gated UI until
   `my_role()` resolves; re-fetch role after every mutation and on auth-state change
   (fixes the stale-owner-UI bug).
2. **Role-filtered navigation** — Settings / Plans / Reports / Staff are admin-only;
   if a staff session lands on a forbidden page (refresh/back), show an
   "Ask your admin for access" state instead of owner content.
3. **Admin dashboard** — KPI cards: active members, today's collections, overdue
   count, expiring ≤7 days, inactive ≥14 days, plans overview + attention queue.
4. **Staff dashboard ("Today")** — check-ins so far, payments collected today,
   due-today list, follow-ups due today, quick actions (New member · Collect fee ·
   Check in).
5. **Staff page (admin-only)** — list `staff_profiles`:
   - **Enable / disable** any staff account (flips `staff_profiles.enabled`;
     access is revoked server-side immediately because `my_gym()` requires `enabled`).
   - **Provisioning helper** — form (name + email) that generates the exact,
     copy-paste SQL for creating the auth user + staff row (full email-invite flow
     with an Edge Function is 🟡 later).
   - Guard rails: cannot disable the last enabled owner; cannot disable yourself.
6. **Relabels** — display "Owner" → **"Admin"**, "Reception" → **"Staff"**
   (`src/App.tsx:993-996`, `1053`).
7. **Every owner-only action enforced in SQL**, not just in the UI (existing
   pattern: owner-only action list in `supabase/migrations/005_professional_workflows.sql:31`).

---

## 2. Members (list → profile → lifecycle)

**Current state:** list + search; profile shows memberships/payments/attendance/
contact log; **archive** exists only as a checkbox inside the edit form
(`src/App.tsx:2571`); **no delete anywhere**; no status badges.

**Market-standard flow:**

```
Add member (validate: name / phone / unique phone)
  → profile → Active → purchase membership → collect fee → receipt
  → Expiring soon (≤7d) → renewal reminder → Renew
  → Expired  → win-back reminder → Renew or Archive
  → Problem case → Archive (keeps history) / Delete (only if zero history)
```

### 🟢 Build

1. **Status badges** on member rows and profile: `Active · Expiring · Expired ·
Frozen · Archived` — computed from memberships (same source as `active()` in
   `src/domain.ts`).
2. **Member actions menu** on the profile header:
   Edit · Collect fee · New membership · **Expire membership** (§3) ·
   **Archive** (one-click with confirm: "keeps financial history") /
   **Restore** · **Delete permanently** (owner-only, see rule below).
3. **Delete flow:**
   - Button enabled **only** when `memberships + payments + attendance +
reminder_logs` rows for that member are all zero.
   - If history exists, the dialog says so and offers **Archive instead**.
   - Confirm by **typing the member's name** (market-standard for destructive acts).
   - SQL action `memberDelete`: owner-only, the zero-history count check runs
     **server-side** (never trusted from the client), writes an audit row.
   - The live SQL action `memberDelete` runs the zero-history count check
     **server-side** (never trusted from the client) and writes an audit row.
     (The old browser demo mode and its `demoAction` mirror were removed; the
     zero-history rule is covered by `tests/database.mjs` against real SQL.)
   - Consequence: receipts and audit history are immutable forever — add a
     database test asserting this.
4. **Archived filter + Restore** — the Archived filter exists (`src/App.tsx:1650`);
   add a visible count and a **Restore** button on archived profiles
   (`archived = false`).

🟡 Later: member photo, CSV import, emergency contact, member self-service portal.

---

## 3. Memberships & Lifecycle (purchase → renew → freeze/cancel/expire)

**Current state:** purchase (start/end/amount/due date); freeze / resume / cancel /
due-date — all owner-only with reason ≥5 chars; **no Expire**; status shown only
passively.

**Market-standard flow:**

```
Purchase (plan → price/months auto-fill; amount override allowed)
  → Active until end
  → Freeze (end extended by inclusive days) → Resume (unused days removed)
  → Expire now (owner + reason)  ┐ both end access,
  → Cancel       (owner + reason)┘ distinct semantics + audit
  → Renewal: previous period kept, new period appended
```

### 🟢 Build

1. **"Expire now"** (owner-only) on a membership — available from the member
   profile and the Memberships page:
   - Requires a reason ≥ 5 characters (same rule as freeze/cancel).
   - Sets the membership to expired **as of today**; it does **not** rewrite the
     original paid `end_date` — instead new columns
     `expired_early boolean` + `expired_at date` record the early end; status
     calculation reads them.
   - Blocked when the membership is already cancelled or already ended.
   - Audit-logged with before/after dates.
   - Report bucket: **"Expired early"** counts separately from "Cancelled".
2. **Renewal shortcut** — on expiring/expired memberships show a one-click
   **Renew** that pre-fills plan and start = day after end.
3. Expiry is **calculated, never destructive** — no retroactive rewrites, so
   receipts and audit stay verifiable.

🟡 Later: session/class packs, member transfer, corporate plans.

---

## 4. Plans (CRUD + delete)

**Current state:** Add + Modify only (`src/App.tsx:2100,2124`); plans live inside
Settings; **no delete**; safe to delete because `memberships.plan_name` is plain
text with no FK (`supabase/migrations/001_gymdesk.sql:7`).

**Market-standard flow:**

```
Admin → Plans → Add (name / months / price) | Modify | Delete
Delete → dialog:
  "Used by 12 past and 2 active memberships.
   Past records keep the name 'Basic'; it disappears from new sales."
```

### 🟢 Build

1. **`planDelete` SQL action** — owner-only; counts memberships by `plan_name`;
   proceeds with delete and audit-logs usage counts; **blocks only** when a
   membership starts today-or-later with that plan (edge case), otherwise
   warn-and-proceed.
2. **Plans as an admin section** (out of Settings) with inline usage counts
   ("2 active · 12 past").
3. Frontend delete button uses the generic confirm dialog; database tests cover
   the guard.

🟡 Later: retire/archive flag as an alternative to delete; session packs.

---

## 5. Fees & Receipts — current full-payment flow

Implemented 23 October 2026: the existing Collect payment and Renew actions share a member-first checkout. Search/select member → choose membership plan and dates or select an existing outstanding membership → review discount/full amount → record method/reference → receive payment → receipt.

Add member supports member details, optional membership, and full payment in one transaction. Profile-only registration remains available. Positive payments must equal the selected charge/balance; existing partial-payment history is preserved. Digital payments require a reference. Paid prices/plan names are protected; existing admin void and correction workflows retain their records. No refund or extra CRM features are introduced here.

Migration: `017_full_payment_checkout.sql`. Tests: `test:checkout`, `test:db`, domain tests, page-layout tests, production build and server tests. Live browser tests are reserved for a disposable local gym.

---

## 6. Attendance (check-in → override → reports)

**Current state:** check-in from member search/profile; unique per India calendar
day; owner override with reason; CSV export.

**Market-standard flow:**

```
Member at gate → search/scan → "Checked in 07:12"
  → (expired/inactive) → owner override with reason
  → attendance log → inactive ≥14d alert in attention queue
```

### 🟢 Build

1. **Quick check-in** from the Staff dashboard card (search → tap → done).
2. Clearer messaging when the membership is expired at check-in.

🟡 **QR kiosk mode** (priority feature) — full-screen check-in page with camera
scan (PWA-friendly), one check-in per scan, override via PIN.
🟡 **Biometric (eSSL/ZKTeco)** — blocked on discovering the device's API; scope
separately.

---

## 7. Reminders & Follow-ups (contact log → WhatsApp automation)

**Current state:** contact log (type / note / next date); attention queue surfaces
due follow-ups; WhatsApp = manual prepared links only ("opens a prepared message;
contact logging is manual" — README).

**Market-standard flow (GymForce / Gyms24 / GymSupport):**

```
Nightly triggers: expires ≤7d | balance overdue ≥X days | inactive 14d
  → WhatsApp template (utility category, ₹0.115/msg)
  → consent check (whatsapp_consent) → opt-out honored
  → delivery status logged (Sent / Delivered / Failed)
  → staff follow-up on replies → contact log closes the loop
```

### 🟢 Build now

- Keep the manual flow; no structural change in this pass.

### 🟡 LATER — WhatsApp Cloud API (priority feature)

- Cloudflare Pages Function `/api/whatsapp` — Meta token stays **server-side**,
  never in the bundle.
- Template setup screen in Settings (owner): connect number, request templates
  (expiry reminder, due notice, receipt), show delivery stats + per-message cost.
- Workers Cron Trigger nightly (IST) → picks candidates → sends →
  `message_logs` table with status webhooks.
- Consent + stop keywords enforced; costs passed through at Meta rates
  (~₹0.115 utility / ₹0.8631 marketing, +18% GST).

---

## 8. Dashboard & Attention Queue

**Current state:** 7-day chart, KPI cards, `AttentionQueue` (unpaid, renewals,
follow-ups due, inactive ≥14 days) — shared by all roles.

### 🟢 Build

1. Split views by role (§1.3 / §1.4).
2. Add **"Expires today"** card and a **staff check-in counter**.
3. Keep the existing deep-link pattern (cards open filtered pages).

🟡 Later: expense entry, P&L card, lead/enquiry funnel.

---

## 9. Reports & Exports

**Current state:** collections / attendance / renewals with date ranges, outstanding
balances, CSV exports — all client-side and currently unaudited.

### 🟢 Build

1. **Owner-only member CSV export**, audit row for every export (collections and
   attendance exports remain available to staff, also audited).
2. **"Expired early"** bucket in renewal/lifecycle reports (from §3).
3. Audit-log viewer for the owner (today `audit_logs` is write-only — the UI
   promises "preserves this receipt in the audit trail" that nobody can see).

🟡 Later: revenue vs expenses, GST/GSTR-1 summary, retention analytics.

---

## 10. Settings & Staff Admin

**Current state:** gym details + plans sections (owner-gated), receipt prefix via SQL,
theme toggle; staff administration requires manual SQL.

### 🟢 Build

1. **Staff page** (§1.5).
2. **Plans section → own page** (§4).
3. Session/auth polish from the hardening list: generic sign-in error
   (stop surfacing raw Supabase errors, `src/App.tsx:347`), consistent password
   minimum, role refresh after mutations.
4. ⛔ No gym-level deletion (single-tenant).

🟡 Later: branding/white-label, WhatsApp config page, subscription/billing if
sold as SaaS.

---

## 11. Auth & Onboarding

**Current state:** email + password, password-reset flow, no public signup.
The former browser demo mode (`localStorage` `gymdesk-demo-v1`, `demoAction`,
demo banner and "Connect your gym" flow) has been **removed entirely**; the app
now runs only against a connected Supabase project and tests sign in to the
local stack.

### 🟢 Build

1. Generic sign-in failure message ("Incorrect email or password").
2. Password minimum applied consistently (client SQL-parity already exists).

---

## 12. Data & API changes — `006_lifecycle_and_portals.sql`

| Action (`gym_action` type) | Actor | Server-side guard                                                                               |
| -------------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| `memberDelete`             | owner | zero-history count across memberships/payments/attendance/reminder_logs; else `raise exception` |
| `expire`                   | owner | reason ≥5 chars; not cancelled; not already ended; sets `expired_early`/`expired_at`            |
| `planDelete`               | owner | usage counts; block only future-starting memberships                                            |
| `staffToggle`              | owner | cannot disable last enabled owner; cannot disable self                                          |
| Portal split               | —     | **frontend-only** — no SQL                                                                      |

Schema additions:

```sql
alter table public.memberships
  add column expired_early boolean not null default false,
  add column expired_at    date;
```

- All four actions write `audit_logs` rows (existing pattern).
- Status calculation in `src/domain.ts` reads `expired_early` / `expired_at`.
- Migration is picked up automatically by `tests/database.mjs`
  (it globs `supabase/migrations/*.sql` sorted).
- Applied manually via the Supabase SQL editor **after a `pg_dump` backup**
  (README deployment flow; Supabase CLI is not installed).

Tests to add:

- `tests/database.mjs` — one test per guard above (delete blocked with history,
  expire reason required, plan delete usage counts, staff toggle rails, role gates).
- `tests/browser.mjs` / `tests/professional-workflows.mjs` — delete-confirm flow,
  expire flow, plan delete, role-conditional navigation (admin vs staff), archive +
  restore.
- `tests/domain.test.ts` — status computation with `expired_early`.

---

## 13. Build order

| Phase                   | Content                                                                                                                                                                                                                                                                          | Status (2026-10-15) |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **0. Safety net**       | `git init` + `.gitignore` fix + baseline commit · npm scripts (`typecheck`, `check:server`, `test:db`, `test:browser`) · dev-server/test port aligned on 5173                                                                                                                    | ✅ done             |
| **1. Portals**          | role-filtered nav (Audit owner-only) · Staff & access manager in Settings (enable/disable/role/remove, keep-one-owner guard) · staff provisioning SQL helper                                                                                                                     | ✅ done             |
| **2. Member lifecycle** | Archive/restore · `memberDelete` (zero-history hard delete) · `expire` (End access) · audit trail page                                                                                                                                                                           | ✅ done             |
| **3. Plans**            | `planDelete` with usage warning (past records keep plan name)                                                                                                                                                                                                                    | ✅ done             |
| **4. UX polish**        | membership edit modal · WhatsApp messaging UI · member photos · birthdays/discounts · check-out flow · PWA install                                                                                                                                                               | ✅ done             |
| **5. Hardening**        | CI workflow � lint/format adoption � security headers (`public/_headers` + CSP) � error boundary + global handlers � friendly SQL-error mapping � export audit � PKCE auth � receipt `lpad` truncation fix � `search_path` fix (public, pg_temp) � live Supabase integration run | ? **done**          |
| **🟡 Later**            | QR kiosk · biometrics · GST invoicing · UPI/Razorpay · member portal · URL routing · expenses/P&L · CSV import · pagination/server summaries                                                                                                                                     | separate plans      |

**Verification gate** (all pass as of the baseline commit):

```sh
npm run typecheck
npm test
npm run check:server
node tests/database.mjs
npm run build
node tests/browser.mjs      # needs dev server on 5173 or GYMDESK_TEST_URL
```

---

## 14. Explicitly deferred (market-standard, not this pass)

| Feature                                           | Why deferred                                                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| GST invoicing (SAC 999721, 18% CGST/SGST, GSTR-1) | Below the ₹20L registration threshold at 30 members                                                                   |
| UPI gateway / Razorpay / AutoPay mandates         | Manual entry works for one gym; webhook infra is its own phase                                                        |
| WhatsApp automation                               | 🟢 built (`functions/api/whatsapp/` + Messages page); go-live depends on Meta-approved templates and live credentials |
| QR kiosk + biometric attendance                   | 🟡 after portals pass; biometrics blocked on device API discovery                                                     |
| Member self-service portal / native apps          | PWA first; native = ₹11.8K first year, rewrite cost                                                                   |
| Enquiry/lead management                           | Not yet needed at single-gym scale                                                                                    |
| Expenses, P&L, Tally export                       | Finance scope beyond collections                                                                                      |
| URL routing + deep links                          | Phase 2 of architecture work (portal split is nav-based for now)                                                      |
| Supabase Pro upgrade                              | Free tier suffices for 30 members; upgrade when real data demands backups/no-pause                                    |

---

## 15. Assumptions

1. Plan delete = **warn and allow** (not hard-block on prior use).
2. Safety-net-first ordering (Phase 0 before features).
3. Staff onboarding ships as a **SQL provisioning helper**, not a full email-invite
   flow (invite = Edge Function + service role, deferred 🟡).
4. "Expire the user" means **force-end the membership**; member-level disable
   remains **Archive**.
5. "Admin" = existing `owner` role, "Staff" = existing `reception` role — no
   schema change to `staff_profiles.role` values.
6. Pricing/business model (₹15K setup + ₹1,000/mo to client gyms) does not change
   any engineering scope in this document; SaaS self-serve signup/billing is out
   of scope until explicitly scheduled.
