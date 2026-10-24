# Architecture and refactoring record — 24 October 2026

The product remains one React application, one Supabase database and Cloudflare messaging handlers. This refactor preserves full-payment checkout, registration, receipt snapshots, archive/void history, membership rules, permissions, INR amounts and India calendar dates.

## Boundaries

- `src/app/useWorkspace.ts`: session-aware server state, loading, mutation coordination, stale-response protection and recovery messaging. Visual page/filter state remains in App.
- `src/data/client.ts`: configured, generated-type Supabase client.
- `src/data/commands.ts`: explicit command names and payload contracts; the existing RPC protocol is retained.
- `src/data/workspaceContract.ts`: runtime validation before response data enters React state.
- `src/data/commandResult.ts`: distinguishes a rejected command from a committed command whose refresh failed.
- `src/data/invalidation.ts`: exhaustive command-to-section refresh map. Old backends continue using full refreshes until capabilities advertise scoped reads.
- `src/domain/workspaceIndex.ts`: linear-time snapshot indexes and constant-time balance lookups. No global cache of mutable data.
- `src/data/photos.ts`, `src/shared/usePhoto.ts`: private content-addressed objects, signed-URL caching, session cache invalidation, inline-photo compatibility and an HTTP-phone hashing fallback.
- `src/features/payments/PaymentReceipt.tsx`: receipt presentation independent of form dispatch and navigation.
- `src/features/reports/Reports.tsx`: reporting feature, loaded on demand. Messaging and administration also load on demand. React, Supabase and icons have separate stable vendor chunks; the main app chunk is about 126 KB uncompressed in this build.
- `src/dashboard.css`: extracted recent dashboard/collection layouts, retaining their original cascade position.
- `functions/api/whatsapp/dispatch.ts`: claim-before-send orchestration. Definitive provider rejection differs from an uncertain outcome; uncertain jobs are not automatically resent.
- `functions/api/whatsapp/transport.ts`: finite external-request deadlines. No blind send retries.
- `src/data/database.generated.ts`: generated public database contracts; regenerate after schema changes.

## Database rollout

Existing migrations 001–017 are unchanged. Additive migrations 018–022 provide scoped reads, compact new audit/request payloads, full-payload SHA-256 replay checks, durable message claims, private photo storage policies and webhook reconciliation.

Applied locally using `supabase migration up --local`. No reset or migration-driven rewriting of member/payment histories. Apply these migrations before deploying matching messaging handlers to another environment. Unknown dispatch outcomes are deliberately held for reconciliation; a crash after a claim may require operator investigation, not automatic retry.

New photo saves use private object storage. Existing inline photos remain readable and are converted on subsequent saves. Historical request/audit payloads are retained, but photo blobs are redacted from the read projection. Uploads preceding a failed transaction can leave unreferenced private objects; any future cleanup job must verify references before deletion.

## Safety and verification

- `npm test`: domain, contract, indexed-balance parity and committed-write/failed-refresh checks.
- `npm run check:server`: signed webhook and durable dispatch tests with intercepted transports; no Meta messages sent.
- `npm run test:db`: isolated PGlite migration/business-rule tests including replay protection, photo ownership and uncertain claims. No live database writes.
- `npm run test:checkout`, `test:dashboard-layout`, `test:workspace-layout`: browser regressions with synthetic intercepted records.
- `npm run test:live` / `test:app-audit`: read-only local-data/empty-state page audit across roles, themes and viewport widths. No domain writes.
- `npm run test:storage`: local-only private-object access test with temporary-object cleanup. It loads local credentials in memory and never prints them.
- Historical live-write harnesses require an explicit disposable-stack opt-in. They are not run against the gym workspace, and the normal CI/live command no longer invokes the historical write suite.

Observed on the local dataset: full workspace JSON 212,867 bytes versus 24,829 bytes for an attendance/audit refresh (uncompressed). This is a response-size observation, not a load-test throughput result.

## Intentionally retained boundaries

This is a substantial incremental refactor, not a claim that every architectural recommendation is finished:

- Initial bootstrap and reports still retain complete core histories. Full server-side pagination/aggregated report queries require a separate parity-tested transition so exports and totals never silently lose records.
- The gym-wide financial lock remains. Removing it without equivalent concurrency constraints and real parallel-transaction tests would weaken correctness. Scoped reads and indexes improve the current workload without taking that risk.
- App still owns several page renderers and form-to-command mapping. Session orchestration, receipts and reports are extracted first; remaining features can be moved one at a time behind the typed contracts.
- Existing foundational CSS still has legacy overrides. The recent dashboard rules were extracted without changing the cascade; a complete stylesheet rewrite would require broader visual baselines.
- Reminder quiet-hour policy changes and new scheduling behaviour are not included in a behaviour-preserving refactor.
- No paid observability service or hosted production deployment is configured by this local change.

## Performance pass (24 October 2026)

See PERFORMANCE.md for measured results and remaining scale limits. Date/currency formatters are reused, chart buckets and dashboard totals aggregate histories in single passes, membership/visit selectors use indexes, expensive dashboard components have memoized calculations and stable fresh callbacks, signed-photo caching is bounded to 256 entries with TTL, and toast timers are cleaned up on unmount. Migration 023 adds tenant/history indexes without changing business records.

## Bounded histories (next scaling step)

Migrations 024�026 add stable keyset reads for receipts/audit, lazy audit startup data and cursor-index cleanup. ServerHistory keeps only the current ten records, cancels obsolete requests and resets cursors on filter changes. Search is debounced; failures have explicit retry. Receipt exports continue using the full matching workspace dataset rather than the displayed page. Attendance and attention lists now mount ten rows using the shared typed paginator.

Verified against all 127 current local receipts (13 pages, no duplicates), and the compiled UI in owner/staff desktop/mobile sessions. No domain records changed. Isolated SQL tests cover role isolation, cursor bounds and complete traversal. Synthetic browser tests additionally verify export completeness, cancellation, retry, query resets and bounded DOM lists.

The remaining startup scalability limit is unchanged: financial/membership/attendance histories still load completely for existing dashboard/report/export calculations. Receipt display paging is not a claim that financial bootstrap memory is now bounded. Next, move those calculations to parity-tested server summaries and provide a complete export path before reducing the bootstrap arrays. Legacy backends/fixtures without the historyPages capability retain the previous client-side receipt/audit views.

## Receipt export read model

Migration 028 adds get_payment_export_page and tenant-bound opaque revisions. The Fees & receipts CSV no longer reads only the browser workspace when paymentExports is available. A lazy adapter requests bounded ascending keyset pages, enforces unchanged revisions and encodes CSV chunks. No file downloads after a failed or cancelled page. Legacy deployments retain the client export path. Transactional revision triggers preserve detection of concurrent relevant data changes; they do not relax the existing financial lock.

This is the first independent complete export consumer. Dashboard/report bootstrap reduction remains a separate coordinated change; full payment and attendance arrays have not been truncated.

## Compact startup boundary

Migration 029 adds get_gym_dashboard alongside the unchanged complete get_gym_data RPC. Data.dashboard explicitly identifies a partial-history projection: raw receipts are limited to five, raw visits to today/latest per member, while lifetime paid totals and time buckets preserve dashboard calculations. Both reads use stable database snapshots and the existing tenant authorization.

useWorkspace chooses the dashboard read for a new session and exposes hydrate for consumers requiring complete history. requiresFullHistory centrally guards pages, modals, selected members and global search; App waits for successful hydration before rendering those consumers. Scoped mutations continue from complete data. Legacy RPC absence permits full-read fallback; authorization failures do not. No arrays are silently truncated while being presented as a complete ledger.

This reduces startup transfer and retained history. It does not yet make every page bounded, remove full member/membership inputs, or relax the per-gym financial lock. Local Supabase migrations through 029 are applied; hosted deployment remains separate.
