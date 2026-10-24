# Performance engineering review — 24 October 2026

The optimization preserves payment amounts, membership status rules, dates, receipts, staff permissions, dashboard layout and record actions. It improves the measured local workload; it is not proof of capacity for millions of concurrent users.

## Findings and implemented changes

| Finding                                                                         | Effect                                                                  | Implemented optimization                                                                                                 |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Every chart bucket filtered every payment and converted its timestamp again     | O(bucket count × payment count) work and temporary arrays               | One pass to bounded daily/hourly totals, then O(bucket count) chart construction                                         |
| Latest membership and activity checks scanned/sorted all memberships per member | Repeated O(member count × membership count) work                        | Latest membership, per-member membership lists and last-visit indexes with original tie/order semantics                  |
| Intl.DateTimeFormat and Intl.NumberFormat were constructed repeatedly           | Expensive ICU setup and short-lived allocation                          | Fixed reusable formatters, preserving INR fraction and India timezone semantics                                          |
| Dashboard calculations reran during unrelated UI state updates                  | Unnecessary aggregation and sorting                                     | Pure memoized dashboard selector; memoized filtered member set; attention categories calculated once per snapshot/day    |
| Plan grouping copied growing arrays for every member                            | Quadratic copying within a popular plan                                 | Single membership pass and append-only grouping arrays                                                                   |
| Memoized components received new callbacks each parent render                   | React.memo would otherwise be ineffective or require unsafe comparisons | Stable event wrappers with latest committed handlers; explicit day props maintain calendar-sensitive invalidation        |
| Photo URL cache grew without a bound                                            | Could retain old private signed URLs/promises throughout long sessions  | 256-entry LRU/TTL cache, session clear and in-flight request coalescing retained                                         |
| Toast timeout had no unmount cleanup                                            | Retained component closure and potential late state update              | Explicit effect cleanup                                                                                                  |
| Tenant latest-history reads lacked matching sort indexes                        | Shared-table scans/sorts become expensive across growing gyms           | Migration 023: audit/message history, payment history, contact history, active renewal/due-date and outgoing-day indexes |

Relevant code: `src/shared/formatters.ts`, `src/analytics.tsx`, `src/domain/workspaceIndex.ts`, `src/features/dashboard/selectors.ts`, `src/shared/BoundedCache.ts`, `src/shared/useStableEvent.ts`, `src/Operations.tsx`, `src/PlanDistribution.tsx` and `supabase/migrations/023_tenant_history_indexes.sql`.

## Algorithm measurements

Synthetic population: 12,000 payments, 6,000 memberships and 3,000 member IDs. Times are medians of five local runs. The indexed membership timing includes rebuilding its index. Reference and optimized outputs are asserted equal. No financial writes or network load are performed.

| Operation                              | Reference | Optimized |
| -------------------------------------- | --------: | --------: |
| Thirty-day aggregation                 |  9.389 ms |  0.999 ms |
| All member latest-period lookups       | 78.826 ms |  2.560 ms |
| 500 currency formats                   | 24.218 ms |  0.316 ms |
| Timestamp conversions for 30-day chart |   360,000 |    12,000 |

These are algorithm timings, not whole-application speedups. The chart benchmark uses an inexpensive date extractor to isolate the aggregation change; actual timezone conversion is covered by separate domain tests.

Run `npm run test:performance`; output: `artifacts/performance-benchmark.json`. No fragile wall-clock pass threshold is enforced in CI; output parity and operation-count assertions catch algorithmic regressions.

## Compiled-browser observation

Read-only local production preview, 162 members / 127 payments / 34 visits:

- Login to dashboard: 635 ms.
- Members navigation: 80 ms.
- Member search: 48 ms.
- Profile open: 114 ms.
- Attendance navigation: 96 ms.
- Fees navigation: 112 ms.
- Dashboard DOM elements: 951.
- Approximate Chromium used JS heap: 9,647,958 bytes after the measured navigation sequence.

These are single local automation observations including interaction/paint waits. They are not p95 measurements, a production SLA, or a before/after browser comparison. Development-mode heap measurements cannot be compared with production measurements to claim a memory reduction. No heap-snapshot leak investigation or concurrent-traffic load test was performed.

Run `npm run test:performance:ui` with `GYMDESK_TEST_URL` pointing at a running local preview and the appropriate Playwright executable configured. The test blocks domain write RPCs and reads an actual member instead of depending on a hard-coded seed name.

## Validation

- 18 domain tests: chart parity, eligibility/overdue/latest-period parity, date-range dashboard totals, cache capacity/expiry/session clearing, financial and timezone regressions.
- 4 messaging/server tests.
- Isolated migration/financial database regression suite.
- Dashboard, checkout and workspace browser suites at desktop/mobile sizes and both themes.
- Production build and read-only compiled-browser measurements.

Migration 023 was applied locally. A large hosted database should build equivalent indexes concurrently using a separate rollout; normal transactional index creation can block writes. Additional indexes consume storage and increase write cost, so validate plans and usage before adding more.

## Remaining limits before genuinely massive traffic

1. **Bound the working set.** Initial bootstrap still downloads full core histories and list views can mount all records. Introduce keyset pagination and server summaries, preserve complete exports as streamed/background jobs, and virtualize large variable-height lists with accessibility and print parity. A CSS scrollbar alone does not reduce DOM or JS memory.
2. **Move large aggregates to PostgreSQL.** Dedicated dashboard/report queries should aggregate within the authenticated gym/date range. Maintain rollups only after measuring query plans and write amplification. Indexes do not solve unbounded result sets.
3. **Preserve financial correctness under concurrency.** The gym-wide command lock remains intentional. Replace it only with equivalent member/membership constraints, receipt allocation and real parallel-transaction tests. Existing isolated tests do not establish concurrent throughput.
4. **Queue external work.** WhatsApp dispatch is durably claimed, but the scheduled HTTP handler still runs a bounded serial send loop. At scale, use queued workers with per-sender limits, bounded concurrency, fair tenant scheduling, backoff and uncertain-outcome reconciliation. Do not simply parallelize all sends.
5. **Measure actual user experience.** Capture p50/p95/p99 route/API latency, LCP/INP/CLS, long tasks, allocation/GC pressure, DB lock wait and pool saturation. Sample telemetry without member details or tokens. Set budgets from real traffic rather than local microbenchmarks.
6. **Test safely at scale.** Use disposable databases with realistic multi-year attendance/payment history and skewed tenants. Ramp concurrency; test sustained load, bursts, queue backlogs and failures. Never stress the gym's actual database or public tunnel by default.
7. **Scale according to measured limits.** Serve static assets from a CDN with hashed-asset caching, keep handlers stateless, use pooled database connections, and enforce per-tenant limits. Add replicas/caches/partitioning only when plans and workload measurements justify them. Cache keys must include tenant/access scope; never share personalized workspace snapshots globally.

The highest next priority is bounded server-side data access, not additional React memoization. Full-history reads and unbounded rendered lists remain architectural limits despite the substantial CPU improvements above.

## Follow-on: bounded receipt and audit histories

- Implemented server keyset pages using `(timestamp, id)` rather than OFFSET, ten records per UI page; SQL rejects limits outside 1�100.
- Audit records no longer ship in startup snapshots. The admin page fetches its own bounded pages and can reach records older than the former 200-row snapshot cap.
- Receipts have server-side substring/date/void-state filtering, stable next/previous navigation and cancellable debounced requests.
- Attendance and attention-list DOM work is bounded to ten rows per page. Existing complete source arrays still drive their counts/exports.
- Synthetic tests verify an export from page 2 contains all 45 matching receipts, not only ten visible rows; larger attention/attendance fixtures mount only ten rows.
- Read-only local check reached all 127 receipt IDs through 13 pages. Startup JSON was 194,403 bytes after removing audit content. This is an observed payload, not a universal improvement ratio.
- Compiled production checks pass for owner/staff, desktop/mobile and real paged audit/receipt queries. No gym records were created, edited or deleted.

Commands: `test:history` (synthetic), `test:history:live` (read-only local app), plus the existing database/browser suites. CI includes the new history checks. Migrations 024�026 were applied locally.

Full core financial bootstrap, client-side export construction, substring search plans at very large per-gym sizes, and report aggregation remain limits. This stage deliberately retains complete financial inputs instead of silently changing totals or truncating exports. Production million-user capacity still requires a realistic disposable-stack load test and the remaining server-summary/export transition.

## Audit remediation — 24 October 2026

Implemented in this pass:
- Scoped refresh validates only requested sections of a previously validated workspace. Unrequested response fields cannot overwrite state.
- Receipt history invalidation follows the payments array; audit follows the audit array. Unrelated section refreshes do not invalidate receipt pages.
- WhatsApp completion refreshes only messaging data. Client sends have a 60-second deadline; timed-out requests retain the same idempotency key.
- Workspace reads are aborted when superseded, on session change, on unmount, and before a mutation.
- CSV serialization uses 500-row batches and Blob parts, yields between batches, and preserves existing bytes, BOM, escaping and formula neutralization. This does not remove the initial rows array or replace full-history exports.
- Migration 027 bounds reminder responses globally to 200 and interleaves candidates by per-tenant rank. Already sending/accepted/unknown scheduled claims are excluded, allowing later candidates to advance on subsequent runs.
- Abandoned sends older than 15 minutes become unknown, never automatically resendable. Cron reports reconciliation counts and logs warnings. The worker stops starting new work after 45 seconds; an active dispatch is allowed to finish.
- Server database RPCs emit operation, status and duration only, excluding personal data and credentials.
- Workspace backend capabilities now have an explicit type.

Rollout: apply migration 027 before deploying the updated reminder endpoint. Regression migration tests use isolated PGlite; no production migration or deployment is implied by passing them.

Still required to close the audit completely:
1. Replace full-history bootstrap with bounded read models, server aggregates and snapshot-consistent exports. All existing dashboard, reports, balance, search and profile consumers must migrate together; simply truncating arrays would silently change financial results.
2. Add a durable cross-day reminder job queue, tenant quotas reserved atomically, dead-letter operations and an operator reconciliation UI. Current candidate regeneration is not a durable backlog for missed days.
3. Measure concurrent PostgreSQL lock waits, then introduce narrower transaction locking with real multi-connection financial regression tests. Existing gym lock remains in place.
4. Capture realistic SQL plans before changing substring-search/index strategies.
5. Configure production telemetry ingestion, alert thresholds, RUM and SLOs, and execute representative multi-tenant load/failure tests. Structured logs alone do not establish these.
6. Reconcile orphaned photo objects with a grace period, batch signing and migrate legacy inline photos.
7. Continue incremental App/database-handler decomposition and style consolidation behind behavioral parity tests.

No million-user capacity claim is made. This pass reduces known overhead and improves failure visibility, but does not close the architectural work listed above.

## Follow-on: revision-checked receipt exports

Migration 028 and the paymentExports capability move the Fees & receipts CSV path to ascending keyset pages of 250 rows (server cap 500). Every page is authorized from the current session; tenant identity and a monotonic data revision form the opaque revision token. Writes to relevant core tables and gym updates advance the revision transactionally. A concurrent edit or tenant reassignment invalidates subsequent pages instead of producing a mixed export. This is optimistic consistency, not a long-lived PostgreSQL snapshot: busy gyms may need to retry.

The browser validates page order including PostgreSQL microseconds, cursor progress, revision identity and cell shapes. CSV output keeps existing headers, row ordering, rupee/paise values, BOM, escaping, search, date and void filters. Only encoded Blob parts survive between export pages; a complete file still occupies browser download memory. Export requests have per-page deadlines, session/unmount cancellation, duplicate-click protection and a pending indicator. Existing backends and demo fixtures retain the earlier export path until the capability is advertised.

Reports now use member/membership maps and per-member renewal candidates instead of repeated global lookups. Workspace indexes and dashboard derivation depend on their source sections so messaging-only updates do not rebuild financial indexes.

Rollout: apply migration 028 after earlier migrations; the frontend can be deployed first and will use its fallback until the capability is available. Preserve migrations 027/028 order before deploying reminder handlers that depend on 027. No hosted migration/deployment is performed by this change.

Verification covers complete multi-page exports, response bounds, exact output fields, case-insensitive search, India date/void filters, concurrent member-edit rejection, owner/staff access and unassigned-account rejection. Browser regressions cover desktop/mobile exports including records absent from the loaded workspace, failure without a partial download, and retry. Client contracts cover cancellation, large revision values and sub-millisecond cursor order.

Remaining: the core workspace bootstrap is still complete and report/member/attendance exports still use it. This stage makes receipt exports independent of that bootstrap; it does not yet remove all historical arrays, replace reports with server summaries, or establish production load capacity. Revision triggers add small per-write counter updates under the existing gym lock; measure this cost in the later concurrency phase.

## Compact dashboard startup (migration 029)

The initial session now reads get_gym_dashboard. This returns core gym/member/plan/membership data, messaging settings, five recent non-void receipts, today's visits plus each member's latest visit, and a dashboard marker containing lifetime paid totals by membership, up to 63 daily payment/visit buckets and 24 hourly payment buckets. The database aggregates histories; it does not serialize their raw rows into startup JSON. Latest visits use bounded lateral index probes per member. Lifetime paid aggregation still reads relevant database history and is not a materialized aggregate.

Dashboard selectors and due-message calculations explicitly understand this projection. All 16 combinations of dashboard and chart ranges have parity checks against complete histories, including old payments settling current balances and voided payments being excluded.

History consumers never render from the limited projection: navigation to any non-dashboard page, opening an editor/member or global search first hydrates get_gym_data. Failed hydration shows a retry state and hides incomplete financial views. Requests have a 30-second deadline, supersession/session cancellation and stale-result guards. Once hydrated, the complete workspace remains in memory until the existing session lifecycle clears it. Missing RPCs on older backends fall back to the full workspace; access or transport failures do not permit fallback. Dashboard summaries refresh on a new India calendar day when the app rerenders.

Local rollout completed: migrations 027, 028 and 029 applied to the local Supabase instance at 127.0.0.1:61321. Hosted databases/deployments were not touched.

Read-only local parity observations (162 members): owner full serialized JSON 194,425 bytes, compact 149,067 bytes; receipts 127 -> 5, visits 34 -> 32. The owner reduction is about 23.3% for this dataset. These are normalized JSON sizes, not compressed HTTP bytes, latency benchmarks or capacity guarantees. See artifacts/dashboard-read-model.json. Owner/staff all-range metrics and compiled desktop/mobile history paging passed without domain writes.

Isolated SQL regression inserts 1,000 old payments and 600 old visits in a disposable transaction: compact JSON grows by less than 1 KB while complete JSON grows by over 100 KB, and lifetime paid amounts remain correct. No sample records were inserted into the gym database by that test.

Remaining limits: all member/membership records, legacy inline photos and membership paid totals still grow with the gym; opening history-dependent pages currently hydrates full payment/attendance histories, rather than fetching each feature independently. The next read-model phase should migrate member profiles, operational pages and reports to bounded queries and aggregates before removing full hydration. General job queues, concurrency/lock work and production load/observability work remain outstanding.

Verification: typecheck, 23 unit tests, server tests, isolated migration/financial tests, synthetic checkout/history/layout suites, build; test:dashboard:live is a new read-only owner/staff parity check included in CI.

Final local UI verification after migration 029: 158 read-only local-data/empty-state page cases passed for owner/staff, five viewport widths, both themes, member tabs, reminders and sign-out. No gym records changed. This supplements synthetic hydration/checkout tests and the SQL parity checks; it is not a production load test.
