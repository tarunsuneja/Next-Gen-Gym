# Gymdesk

The NGF workspace includes light/dark themes, responsive mobile record cards, paginated members/payments, explicit payment selection with a remaining-balance preview, membership status distinctions and guided new-member onboarding. Forms use keyboard focus containment and payment retries retain their request IDs. `tests/ui-review.mjs` exercises all screens at desktop/mobile sizes in both themes, plus selection and pagination behavior.

React + TypeScript + Supabase gym management MVP. Red/black NGF branding, light/dark themes, phone layouts, member search, calendar-month memberships, renewals, partial payments, receipt snapshots, voids, attendance, actionable dashboard, follow-up tracking, CSV reports and editable plans.

## Run

```sh
npm install
npm run dev
```

Open the URL printed by Vite. **Explore demo workspace** uses sample records persisted only in this browser. It is not a production login or shared database. Never enter real member data in demo mode.

## Connect Supabase

1. Create a Supabase project. Apply all migrations in order (`001` through `013`) in its SQL editor. For existing projects apply only unapplied migrations. `004_daily_operations.sql` adds due dates, membership freeze/resume/cancellation, WhatsApp consent and follow-up notes/dates. `005_professional_workflows.sql` adds consistent phone/email validation, duplicate-phone safeguards and payment/receipt request correlation. `006_whatsapp_reminders.sql` adds WhatsApp Cloud API configuration, message templates, reminder rules, the message log and service-role-only helper functions used by the Pages Functions. `007_staff_audit_admin.sql` adds the owner-only Staff & access manager, plan/member deletion, early membership expiry and the activity audit trail. `008_lifecycle_integrity.sql` adds audited attendance corrections, contact edits, template/rule dependency checks and safe delivery-event replay. `009_membership_edit.sql` adds an owner-only membership correction that preserves collected payments and clears freeze periods. `010_member_photos.sql` adds optional member photo storage with data-URL validation. `011_birthdays_discounts_departures.sql` adds birthdays, multi-tier discounts with net-fee validation and archiving/departure tracking. `012_attendance_checkout.sql` adds check-out timestamps and a hardened check-out workflow. `013_hardening.sql` closes the six-digit receipt truncation edge case, adds CSV export auditing and re-asserts a hardened security-definer search_path (`public, pg_temp`). Plan updates only affect future membership purchases; existing periods retain their original name and fee.
2. Create an owner account in Authentication > Users. Edit and run `supabase/provision-gym.sql` with the owner's email and gym name. There is no public signup.
3. Copy `.env.example` to `.env.local`. Set the project URL and publishable/anon key. Never put a service-role or secret key in a `VITE_` variable.
4. Restart Vite and sign in. Set gym details in Settings; add membership plans as needed.
5. Set Supabase Auth Site URL and password-reset redirect allowlist to the deployment origin. Configure production SMTP for reliable password reset emails.
6. Reception users are provisioned by the owner using the commented SQL example. Owner-only settings, plan creation, overrides and voids are enforced server-side.

The database uses RLS with no direct table grants for browser roles. Authenticated security-definer functions validate gym ownership and staff permissions. Payments, sequential receipts, audit records and request idempotency are committed atomically. Gym-row locking serialises writes and prevents renewal overlaps and concurrent overpayments. Money is integer paise. Attendance is unique per member per India calendar day.

## Cloudflare Pages

Connect this repository. Build command: `npm run build`. Output directory: `dist`. Set both `VITE_SUPABASE_*` build environment variables. `public/_redirects` enables SPA routing. Variables are baked into the public bundle; only publishable credentials are appropriate.

## WhatsApp automation

The **Messages** page (owner only for writes) manages WhatsApp Cloud API settings, message templates and reminder rules, and shows today's due queue plus the delivery log. Everything also works in the demo workspace with simulated sending.

Server code lives in Cloudflare Pages Functions under `functions/api/whatsapp/`:

- `send.ts` — sends one reminder for a member/template (signed-in owner only).
- `webhook.ts` — Meta verification (`GET`) and delivery-status/reply ingestion (`POST`). A configured `WHATSAPP_APP_SECRET` and a valid signature are required. Persistence failures return a retryable response instead of acknowledging a lost event.
- `cron.ts` — dispatches all due reminders; call it on a schedule with the `x-cron-secret` header.
- `lib.ts` — shared helpers.

Set these Cloudflare Pages environment variables (server-only, never `VITE_`):

- `WHATSAPP_TOKEN` — Meta permanent access token.
- `WHATSAPP_VERIFY_TOKEN` — any secret string, entered in the Meta webhook setup.
- `WHATSAPP_APP_SECRET` — required for accepting signed delivery/reply webhooks.
- `WHATSAPP_API_VERSION` — optional, defaults to `v21.0`.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — used by the Functions only.
- `CRON_SECRET` — shared secret for the cron endpoint.

Meta webhook URL: `https://<your-domain>/api/whatsapp/webhook`. Pages Functions have no cron trigger, so schedule `POST https://<your-domain>/api/whatsapp/cron` daily (for example a GitHub Actions `schedule` step or a Cloudflare Worker cron) with `x-cron-secret: $CRON_SECRET`. Templates must be approved by Meta and their names must match the stored template names. Verify current Meta and provider message charges before enabling live sending; no fixed message price is assumed by this app.

## Staff, access & audit

Owners manage staff in **Settings → Staff & access**: add a colleague by the email already created in Supabase Authentication, switch between Owner and Reception, disable or remove access, with a guard that keeps at least one enabled owner. Reception staff are limited to daily operations; destructive actions (voids, overrides, plan/member deletion, membership expiry, WhatsApp and staff changes) are owner-only and enforced server-side.

Members can be archived (kept for balances/history) or, when they have no payment records, permanently deleted from the member profile. Membership access can be ended early with a reason. Every saved change is written to `audit_logs` and shown in the owner-only **Audit** page.

## Checks

```sh
npm test
node tests/database.mjs
npm run build
npm run check:server
```

`tests/database.mjs` applies all migrations to an in-memory PostgreSQL runtime with a simulated Auth schema and checks financial safeguards, export auditing and permissions. It does not replace live Supabase verification. For browser checks run any of the suites below with Vite running; set `GYMDESK_TEST_URL` if using another port and `GYMDESK_BROWSER_PATH` to an installed Chromium executable when needed. Screenshots are written to `artifacts/`.

```sh
node tests/browser.mjs              # core member/payment/attendance flows
node tests/navigation-plans.mjs     # sidebar persistence, plan editing, mobile nav
node tests/operations.mjs           # dashboard cards/search, lifecycle, report export
node tests/professional-workflows.mjs
node tests/lifecycles.mjs           # soft delete, member lifecycle, WhatsApp, staff, audit
node tests/dashboard.mjs            # dashboard ranges, trends, chart
node tests/reports.mjs              # report ranges, analytics, CSV exports, print
node tests/ui-review.mjs            # every screen, light/dark, desktop/mobile
```

## Current limits / next launch steps

- Supabase project credentials and accounts are required for live operation. SQL must be applied and integration-tested against that project; a local build does not verify remote SQL.
- Initial implementation loads gym records as one snapshot. Pagination/server summaries should be added as history grows. Reload the page to see another staff member's changes; financial writes still validate current server balances.
- Fees currently consist of membership charges. Joining fees, refunds, credits and tax invoices are not implemented. Receipts acknowledge payments; they are not GST tax invoices.
- Owners can create/edit/delete plans, set payment due dates, freeze/resume/cancel/expire memberships and manage staff in the member profile and Settings. Receipt-prefix editing still requires administrative SQL.
- CSV exports are provided. CSV imports/opening-balance migration, member photos, QR attendance and biometric integration are not implemented yet.
- Automated WhatsApp reminders are implemented; delivery depends on Meta-approved templates and the server settings above. Inbound replies are logged but not auto-replied. Select the category appropriate to the approved template; local template definitions do not establish Meta approval.
- WhatsApp opens a prepared message; contact logging is manual and is not proof of delivery. Obtain member consent before messaging.
- Biometrics requires the actual device model and supported vendor interface. No fingerprint templates are stored.
- Continuous integration runs typecheck, unit/server/DB tests, build and a Chromium browser job. A separate "Database backup (free tier)" workflow (`.github/workflows/backup.yml`) can be scheduled or dispatched to dump the database to an artifact; configure `SUPABASE_DB_URL` as a repository secret.
- Back up the database before live migration, retain exports securely and perform a restore rehearsal. Supabase database backups do not include Storage files. The free-tier backup workflow uploads a compressed `pg_dump` as a 90-day artifact.
- Before handling real records, verify live login/reset, owner/reception permissions, isolation, parallel payments/retries, receipt snapshots, mobile usability and backup restoration using staging data.
- Deploy under accounts owned by the gym. Hosting/domain/message fees are paid directly to their providers.

## Daily operations rules

- Dashboard cards open filtered records. Member search opens the profile. The attention queue covers unpaid balances, renewals, latest-contact follow-ups due today, and no recorded attendance for 14+ days. It is a staff aid, not a churn prediction.
- New memberships default their payment due date to the start date; staff can set a different date. Migrated historical records have an unknown due date until the owner sets one; they are not silently classified as overdue.
- Only owners can freeze/resume/cancel or change due dates. Freeze dates must be within a valid membership, beginning today or later. Expiry extends by the inclusive freeze days. Conflicting future periods block the change. Resume removes unused extension days and permits access today.
- Cancellation immediately stops access, preserves the charged amount and receipts, and permits a replacement membership. It does not waive debt or refund money. Attendance requires an owner override when no eligible, unfrozen membership exists.
- Member WhatsApp consent controls prepared-message links. Contact logs are manual; they store the outcome and optional next date, not delivery evidence. A new contact without a next date closes the previous scheduled follow-up.
- The **Dashboard** has a time-range selector (Today / 7 / 30 days / This month) that rescopes the KPIs (collections, new members, check-ins, pending fees) with period-over-period trends and drives the collections chart (hourly for today, daily otherwise).
- **Reports** use India dates and exclude void payments. A range selector (This month, Last month, 30/90 days, This year or a custom span) rescopes collections, new members, check-ins, renewal rate and the revenue-by-plan and attendance breakdowns, each with a trend against the preceding equal period. A **Retention & lapsed** panel lists periods that ended without a later membership, and outstanding balances stay current and clearly separate. Every panel exports to CSV (`collections-`, `revenue-by-plan-`, `attendance-`, `lapsed-members-`, `new-members-`, `outstanding-balances`) and **Print / PDF** archives the current view. A renewal count is the number of expiring periods with a subsequent recorded period, not a member-retention estimate.
- Run `node tests/dashboard.mjs` for the dashboard ranges/trends/chart and `node tests/reports.mjs` for the report ranges, analytics and exports. `node tests/operations.mjs` covers dashboard search/cards, lifecycle controls, follow-up queue and report export. `tests/ui-review.mjs` checks all pages in both themes at desktop/phone widths.
- Add/edit forms identify invalid fields, preserve entered values and group optional details. Indian +91 numbers are normalized to 10 digits; international numbers retain their country code. Shared family numbers require an explicit checkbox. Saves retain request IDs for retry protection, and busy dialogs cannot be dismissed during a write.
- Payment collection supports searching outstanding members, full-balance shortcuts, partial-payment previews and an immediate receipt after saving. `tests/professional-workflows.mjs` verifies add/edit validation, duplicate submissions, profile preservation, partial/full fees, receipts and replay protection on desktop and phone. Screenshots are in `artifacts/workflows/`.

## Lifecycle audit coverage

| Page             | Verified lifecycle and deletion policy                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard        | Current snapshots, range KPIs, all 24 hourly buckets, matching drill-down dates and exports, attention queues                             |
| Members          | Create/edit, normalization and duplicates, archive/restore, confirmed owner deletion with payment-history protection                      |
| Memberships      | New/renew, overlap checks, due-date edits, freeze/resume, early expiry and cancellation while preserving charges                          |
| Fees & receipts  | Search, partial/full amounts and all four methods, replay prevention, immediate immutable receipt, owner void/correction                  |
| Attendance       | Check-in, eligibility/override, duplicate prevention and owner correction with original row/reason retained in Audit                      |
| Reminders        | Create/edit contact notes and next date, preserving the original contact timestamp; manual WhatsApp requires consent                      |
| Messages         | Config/templates/rules/queue/log, rename propagates dependencies, referenced-template deletion is blocked, placeholder order is preserved |
| Settings & staff | Plan CRUD with historical snapshots, gym details, staff add/role/disable/remove, retained form input after failure and last-owner guards  |
| Reports          | Date filters, correctly labelled collections, current outstanding balances, matching CSV exports and print                                |
| Audit            | Owner-only read-only history; original data retained for corrected attendance and contacts                                                |

`node tests/audit-edges.mjs` checks range drill-down/export agreement, failed staff saves, template dependencies and all ten pages with empty business records on desktop/phone. `tests/server.test.ts` uses mocked network calls to test webhook verification/retries, enabled-staff access and outbound parameter positions. It never sends a real message.

The installable shell no longer caches development source modules or error HTML, and only its own versioned caches are removed. Source edits remain visible in local/tunnel previews. Live Supabase login/reset, configured Meta delivery, concurrent message dispatch, deployment behaviour and backup restoration still require staging verification. Passing demo tests is not a production or accessibility certification.

### Birthdays, monthly member movement and discounts

- Add/Edit Member includes optional date of birth. Future dates are rejected.
- Dashboard shows today's birthdays with WhatsApp wishes links. Links open a prepared message; staff sends it in WhatsApp. These links do not use automatic Cloud API delivery. A member profile also exposes the wishes link when DOB is recorded.
- Joined/Left this month lists use the current calendar month regardless of the collections range. Joined uses the member joining date. Left counts members currently archived with a recorded departure date in the month. Restoring removes the departure marker. Existing archives without a known date are not assigned an invented date; expired memberships are not automatically counted as departures.
- New/renewed and edited memberships support fixed INR or percentage discounts. Base fee, discount and net charge are preserved; pending balances use the net charge. Editing cannot reduce the net charge below valid payments already collected. Existing payment receipts remain unchanged.
- Apply migration `011_birthdays_discounts_departures.sql` before using these features with live Supabase. Demo data continues to persist separately in each browser.

### Attendance check-out

Attendance supports one visit per member per Kolkata calendar day. After checking in, staff can check out from Attendance or the member profile on the same day. Check-outs persist a timestamp and audit action, cannot be repeated, and do not enable a second check-in that day. Today's inside/checked-out counts, history, duration and attendance CSV include checkout information. Previous visits without a checkout remain marked as not recorded. Live Supabase requires migration `012_attendance_checkout.sql`.
