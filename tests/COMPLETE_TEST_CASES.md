# Gymdesk - Complete Detailed Test Cases

## Test Environment
- App URL: http://127.0.0.1:5173
- API: http://127.0.0.1:61321 (local Supabase)
- Roles: Owner (Admin UI) = owner@gym.local / password123; Staff (Reception) = staff@gym.local / password123; Coach = coach@gym.local / password123 (non-staff)
- Seed: 150 members, 150 memberships, 120 payments, 10 attendance, 4 plans
- Plans: Basic 1mo (₹120000), Standard 3mo (₹300000), Premium 6mo (₹550000), Ultimate 12mo (₹1020000)
- Receipt format: GD-######

## 1. Authentication & Roles

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| AUTH-01 | Owner login success | P0 | App running, user exists | Login with owner@gym.local/password123 | Redirect to Dashboard; role owner; shows Admin UI (Settings, Staff, Audit visible) | Positive |
| AUTH-02 | Staff login success | P0 | User exists with role reception | Login with staff@gym.local/password123 | Redirect to Dashboard; role reception/staff; Admin-only areas hidden | Positive |
| AUTH-03 | Non-staff coach rejected | P0 | coach@gym.local exists, no active gym access | Login with coach@gym.local/password123 | Error: "No active gym access." Login blocked | Negative |
| AUTH-04 | Invalid credentials | P0 | N/A | Wrong email/password | Auth error shown | Negative |
| AUTH-05 | Session persistence | P1 | Logged in | Refresh page | Remains logged in | Regression |
| AUTH-06 | Sign out | P0 | Logged in | Click Sign out | Returns to login screen | Positive |

## 2. Dashboard (Home)

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| DASH-01 | Load with 150 members | P0 | Seeded data, owner logged in | Open Dashboard | Shows counts: total members, active, collections, dues/expiries | Positive |
| DASH-02 | Recent payments shown | P1 | Payments exist | View Recent payments | Up to 4 recent payments displayed | Positive |
| DASH-03 | Renewals coming up (next 7 days) | P1 | Memberships with expiry soon | View Renewals section | Correctly lists expiring memberships | Positive |
| DASH-04 | Birthday/upcoming events | P1 | Members with DOB | View highlights | Birthdays shown correctly | Positive |
| DASH-05 | Collections by range | P1 | Date range filter applied | Click range chip | Navigates to filtered view | Positive |

## 3. Members - List, Search, Filters

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| MEM-01 | List loads with pagination | P0 | 150 members | Go to Members | Paginated list; can navigate pages | Positive |
| MEM-02 | Search by name | P0 | Jatin 119 exists | Search "Jatin 119" | Result shows Jatin 119 | Positive |
| MEM-03 | Search by phone | P0 | Member has phone | Search partial/full phone | Correct result | Positive |
| MEM-04 | Search by member ID | P1 | ID known | Search ID | Found | Positive |
| MEM-05 | Filters - All/Active/Inactive/Expired/Pending/Overdue/Expiring/Archived | P1 | Mixed states | Apply each filter | Correct subset shown | Positive |
| MEM-06 | Joined in range filter | P1 | viewRange set | Apply date range | Only members joined in range | Positive |
| MEM-07 | Clear filters | P1 | Filters active | Clear | Back to default | Positive |

## 4. Members - Add/Edit/Archive/Restore

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| MEM-08 | Add member (valid) | P0 | Owner/Staff | Add with name, phone, gender, email, DOB, address, height/weight | Member created; appears in list | Positive |
| MEM-09 | Duplicate phone rejected | P0 | Phone exists | Try same phone | Error: duplicate phone | Negative |
| MEM-10 | Shared phone allowed | P0 | Config allows? (default) | Add with existing phone? Depends on rules | Per validation - shared phones may be allowed? Check: validate-all checks duplicate phone; also "two members can share phone number" scenario? | Negative/Positive |
| MEM-11 | Invalid phone format | P0 | N/A | Bad phone | Validation error | Negative |
| MEM-12 | Invalid email | P0 | N/A | Bad email | Validation error | Negative |
| MEM-13 | Invalid gender | P0 | N/A | Other values | Validation error | Negative |
| MEM-14 | Future DOB rejected | P0 | N/A | DOB > today | Validation error | Negative |
| MEM-15 | Height/weight out of range | P0 | N/A | Height 0 or >300cm; weight 0 or >500kg | Validation error | Boundary |
| MEM-16 | Edit member | P0 | Member exists | Change name/phone/contact | Updated successfully | Positive |
| MEM-17 | Archive member | P0 | Active member | Archive | Marked archived; excluded from active views | Positive |
| MEM-18 | Restore archived member | P0 | Archived member | Restore | Becomes active | Positive |
| MEM-19 | Member with payments cannot be deleted | P0 | Member has payments | Try delete | Error: "This member has payment records. Archive the member instead of deleting." | Negative |
| MEM-20 | Clean member can be deleted | P0 | New member no payments/memberships? | Delete | Removed (cascades attendance/memberships/message_logs per rules) | Positive |

## 5. Memberships

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| MS-01 | Create membership (Basic 1mo) | P0 | Member exists, plan exists | Sell membership for member | Membership created; dates set correctly (start/end based on months) | Positive |
| MS-02 | Create membership (Standard 3mo) | P0 | Member exists | Sell 3mo | End = start + 3mo | Positive |
| MS-03 | Create membership (Premium 6mo) | P0 | Member exists | Sell 6mo | Correct end date | Positive |
| MS-04 | Create membership (Ultimate 12mo) | P0 | Member exists | Sell 12mo | Correct end date | Positive |
| MS-05 | Cannot create overlapping active membership | P0 | Member has active membership | Try new membership | Error: membership overlap/not allowed while active | Negative |
| MS-06 | Unknown plan rejected | P0 | Invalid planId | Create with bad planId | Error | Negative |
| MS-07 | Discount percentage validation | P0 | Valid discount 0-100 | Set discount 10% | Amount calculated correctly (price*(1-disc/100)) | Positive |
| MS-08 | Discount > 100% rejected | P0 | Bad discount | Set 150% | Validation error | Boundary/Negative |
| MS-09 | Discount < 0% rejected | P0 | Bad discount | Set -5% | Validation error | Boundary/Negative |
| MS-10 | Fixed discount vs percentage? | P0 | Per schema | Apply fixed discount amount | Handled per rules | Positive |
| MS-11 | Reception can sell membership | P0 | Staff logged in | Staff creates membership for member | Success | Positive (staff allowed) |
| MS-12 | Edit membership (admin only) | P0 | Owner | Edit dates/amount? membershipEdit requires admin | Success if owner | Permission |
| MS-13 | Staff cannot edit membership | P0 | Staff logged in | Try membership edit | Error "Admin permission required." | Permission Negative |

## 6. Payments

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| PAY-01 | Collect full payment | P0 | Membership created | Pay full amount | Payment recorded; membership balance/settled updated; receipt GD-###### issued | Positive |
| PAY-02 | Collect partial payment | P0 | Membership with balance | Pay partial | Balance reduced; receipt issued | Positive |
| PAY-03 | Settle membership with payments | P0 | Partial payments sum to amount | Continue paying until settled | Membership marked settled/fully paid | Positive |
| PAY-04 | Overpay not allowed? | P0 | Check rules | Try paying more than balance | Validation/rejection | Negative/Check |
| PAY-05 | Zero amount payment rejected | P0 | N/A | Amount 0 | Validation error | Boundary |
| PAY-06 | Negative amount rejected | P0 | N/A | Amount -100 | Validation error | Boundary |
| PAY-07 | Receipt numbering increments (GD-######) | P0 | Sequential | Create payments | Next receipt number increments; no gaps incorrectly | Positive |
| PAY-08 | Idempotency - duplicate gym_action | P0 | Same request_id | Replay same action | No duplicate payment created | Idempotency |
| PAY-09 | Void payment (admin only) | P0 | Payment exists | Owner voids with reason (min 5 chars) | Payment voided; balance restored; audit trail preserved | Positive |
| PAY-10 | Staff cannot void payment | P0 | Staff logged in | Try void | Error "Admin permission required." | Permission |
| PAY-11 | Void requires reason (admin) | P0 | Owner voiding | Submit without reason or <5 | Validation error | Negative |
| PAY-12 | View receipt | P0 | Payment exists | Open receipt modal | Shows receipt number, member, amount, date, membership | Positive |

## 7. Lifecycle Operations (Admin mostly)

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| LIF-01 | Freeze membership (admin) | P0 | Active membership | Owner freezes with dates/reason | Status frozen; access suspended during freeze window | Positive |
| LIF-02 | Freeze with past dates rejected? | P0 | Past freezeEnd? | Try past dates | Validation/rejected | Negative |
| LIF-03 | Resume frozen membership (admin) | P0 | Frozen membership | Resume | Becomes active/resumed | Positive |
| LIF-04 | Change due date (admin) | P0 | Membership exists | Update due date | Updated | Positive |
| LIF-05 | Edit membership below collected amount? | P0 | Payments already collected | Try reducing amount below collected | Validation prevents? Check rules | Negative |
| LIF-06 | Expire membership (admin) | P0 | Active membership (or conditions met) | Expire | End access; membership expired | Positive |
| LIF-07 | Cannot expire if currently frozen (past end?) | P0 | Frozen with future end | Try expire | Blocked per rules | Negative |
| LIF-08 | Cancel membership (admin) | P0 | Membership exists | Cancel | Cancelled state | Positive |
| LIF-09 | Freeze on cancelled membership rejected | P0 | Cancelled | Try freeze | Rejected | Negative |
| LIF-10 | Operations require admin | P0 | Staff for each op | freeze/resume/dueDate/expire/cancel | All return "Admin permission required." | Permission |

## 8. Attendance

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| ATT-01 | Check-in member with active membership | P0 | Member has active membership | Check in | Attendance recorded (checked in) | Positive |
| ATT-02 | Check-in without active membership (override) | P0 | Member no active membership | Try check-in -> override flow | Override modal appears | Positive Flow |
| ATT-03 | Override requires admin reason | P0 | Override requested | Owner provides reason (min 5 chars) | Check-in allowed with reason | Positive |
| ATT-04 | Staff cannot override alone? | P0 | Staff triggers override | Staff must have admin? Override action requires admin approval? | "Admin permission required." if role!=owner | Permission |
| ATT-05 | Double check-in same day? | P0 | Already checked in today | Try check-in again | Handled per rules (duplicate check-in) | Negative/Idempotent |
| ATT-06 | Checkout | P1 | Checked in | Checkout | Updated with checkout time | Positive |
| ATT-07 | Remove attendance (admin only) | P0 | Attendance record exists | Owner removes with reason | Record removed; audit logged | Positive |
| ATT-08 | Staff cannot remove attendance | P0 | Staff | Try remove | "Admin permission required." | Permission |
| ATT-09 | Attendance remove requires reason | P0 | Owner | Remove without reason | Validation error | Negative |
| ATT-10 | Attendance list/search | P0 | Attendance records | Search member in attendance | Filtered results | Positive |

## 9. Reminders

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| REM-01 | View reminders | P0 | Owner/Staff | Go to Reminders | List shows reminder rules | Positive |
| REM-02 | Create reminder rule (admin) | P0 | Owner | Add rule with type/trigger/days/template | Created | Positive |
| REM-03 | Update reminder rule (admin) | P0 | Owner, rule exists | Edit rule | Updated | Positive |
| REM-04 | Delete reminder rule (admin) | P0 | Owner, rule exists | Delete | Removed | Positive |
| REM-05 | Staff cannot manage reminder rules | P0 | Staff | Try create/update/delete | "Admin permission required." | Permission |
| REM-06 | Reminder rules list shows upcoming expiries | P1 | Expiring soon exist | View | Correctly computed | Positive |

## 10. WhatsApp Messaging

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| WA-01 | WhatsApp config (admin) | P0 | Owner | Configure WhatsApp settings | Saved (admin only) | Positive |
| WA-02 | Seed WhatsApp templates (admin) | P0 | Owner | Seed templates | Templates populated | Positive |
| WA-03 | Create WhatsApp template (admin) | P0 | Owner | Add template with valid fields | Created | Positive |
| WA-04 | Delete WhatsApp template (admin) | P0 | Owner, template exists | Delete | Removed | Positive |
| WA-05 | Template variable format validation | P0 | Owner | Invalid variable syntax | Validation error | Negative |
| WA-06 | WhatsApp rule lifecycle (admin) | P0 | Owner | Create/update/delete rules | All work as admin | Positive |
| WA-07 | Staff cannot configure WhatsApp | P0 | Staff | Any WA admin action | "Admin permission required." | Permission |
| WA-08 | Messages page loads | P0 | Owner/Staff | Go to Messages | Page renders with history/logs | Positive |

## 11. Settings, Plans & Permissions

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| SET-01 | Settings page (admin) | P0 | Owner | Open Settings | Full access to settings | Positive |
| SET-02 | Settings page (staff) | P0 | Staff | Open Settings | Limited view; admin-only controls hidden | Permission |
| SET-03 | Create plan (admin) | P0 | Owner | Add plan: name, months, price, active | Plan created | Positive |
| SET-04 | Update plan (admin) | P0 | Owner, plan exists | Edit plan | Updated | Positive |
| SET-05 | Delete plan (admin) | P0 | Owner, plan exists | Delete plan (not in use?) | Deleted if safe | Positive |
| SET-06 | Delete plan in use | P0 | Plan has memberships | Try delete | Blocked/rejected | Negative |
| SET-07 | Plan validation | P0 | Owner | Invalid months/price | Validation error | Negative |
| SET-08 | Gym settings update (admin) | P0 | Owner | Update gym name/address/phone etc | Saved | Positive |
| SET-09 | Staff cannot access admin settings | P0 | Staff | Any admin action in settings | "Admin permission required." | Permission |

## 12. Staff Management (Admin only)

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| STF-01 | View staff list (admin) | P0 | Owner | Settings/Staff section | Staff list visible | Positive |
| STF-02 | Staff cannot see staff list | P0 | Staff | N/A | staff[] not exposed to reception; UI hides | Permission |
| STF-03 | Add staff (admin) | P0 | Owner | Add staff user/profile with role reception | Staff added; can login | Positive |
| STF-04 | Add duplicate staff | P0 | Staff exists | Try adding same email | Rejected | Negative |
| STF-05 | Cannot add self as staff? | P0 | Owner | Self-guard check | Blocked | Negative |
| STF-06 | Update staff (admin) | P0 | Owner, staff exists | Update role/details | Updated | Positive |
| STF-07 | Remove staff (admin) | P0 | Owner, staff exists | Remove | Staff access revoked | Positive |
| STF-08 | Staff management guards | P0 | Various | Test self-removal etc | Protected | Negative |

## 13. Reports & Audit

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| REP-01 | Reports page loads | P0 | Owner/Staff | Go to Reports | Charts/tables render | Positive |
| REP-02 | Collections report | P0 | Payments exist | View collections | Correct totals by period | Positive |
| REP-03 | Renewals report | P0 | Expiring memberships | View renewals | Accurate list | Positive |
| REP-04 | Attendance report | P0 | Attendance exists | View attendance | Correct counts | Positive |
| REP-05 | Balances report | P0 | Outstanding balances | View | Correct balances | Positive |
| REP-06 | Audit trail visible (admin only) | P0 | Owner | Go to Audit | Full audit log shown | Positive |
| REP-07 | Audit trail hidden (staff) | P0 | Staff | Audit nav item hidden; cannot access | "Admin permission required." if attempted | Permission |
| REP-08 | Audit entries created | P0 | Owner performs actions (void, delete etc) | Check audit | New entries logged with actor, action, timestamp | Positive |
| REP-09 | Export functionality | P0 | Owner | Export reports/data | Export produced | Positive |

## 14. Fees & Receipts (Dedicated page)

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| FEE-01 | Fees & receipts page loads | P0 | Owner/Staff | Navigate to Fees & receipts | Lists payments/receipts | Positive |
| FEE-02 | Collect payment from Fees page | P0 | Member with balance | Click Collect payment | Modal opens; can record payment | Positive |
| FEE-03 | Search payments/receipts | P0 | Payments exist | Search by member/receipt | Filtered | Positive |
| FEE-04 | View receipt from list | P0 | Receipt exists | Click view receipt | Receipt modal shows full details | Positive |
| FEE-05 | Pagination works | P0 | Many payments | Navigate pages | Correct page shown | Positive |

## 15. Global Search & Navigation

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| NAV-01 | All nav items render (owner) | P0 | Owner logged in | Click each nav: Dashboard, Members, Fees & receipts, Attendance, Reminders, Messages, Settings, Reports, Audit | Each page loads with correct heading | UI Positive |
| NAV-02 | Nav items filtered (staff) | P0 | Staff logged in | View nav | Audit not shown; Settings visible but limited | Permission |
| NAV-03 | Global search (Ctrl+K / click) | P0 | Open global search | Search "Jatin" | Returns matches (members, receipts, etc.) | Positive |
| NAV-04 | Global search navigates to result | P0 | Search finds member | Click result | Navigates to member/profile | Positive |
| NAV-05 | Back navigation from detail | P0 | In member detail | Click Back to Members | Returns to Members list | Positive |
| NAV-06 | Mobile responsive nav | P1 | Small viewport | Open menu | Sidebar toggles correctly | UI |
| NAV-07 | Sidebar collapse/expand | P1 | Click toggle | Collapse/expand | State persists in localStorage | UI |

## 16. Error Handling, Guards, Edge Cases

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| ERR-01 | Unknown action rejected | P0 | gym_action with invalid action | Call invalid action | Rejected (guard rails) | Negative |
| ERR-02 | Admin permission required messages | P0 | Staff tries admin ops | Each admin op | Exact message "Admin permission required." | Permission |
| ERR-03 | Network error handling | P1 | Offline? Simulate | Trigger action offline | Friendly error shown (friendlyError mapping) | Negative |
| ERR-04 | Validation errors displayed | P0 | Invalid form | Submit bad data | Field-level/inline errors | Negative |
| ERR-05 | Modal ESC closes (when not busy) | P1 | Modal open | Press ESC | Modal closes | UI |
| ERR-06 | Modal backdrop click | P1 | Modal open | Click overlay | Closes if not blocked | UI |
| ERR-07 | Cannot submit busy forms | P1 | Form submitting | Click submit again | Blocked | UI |
| ERR-08 | Long names/inputs | P1 | Boundary lengths | Max length inputs | Truncated/validated per schema | Boundary |
| ERR-09 | Special characters in names | P1 | Unicode names | Add member with accents | Handled correctly | Boundary |

## 17. Data Integrity & Idempotency

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| INT-01 | Cascades on member delete (clean) | P0 | Member with attendance/memberships/logs only | Delete clean member | attendance, memberships, message_logs cascaded; member removed | Integrity |
| INT-02 | Payments block member delete | P0 | Has payments | Delete | Blocked with specific message | Integrity |
| INT-03 | gym_action idempotency | P0 | Replay same request_id | Same action twice | Second returns same result; no duplicate | Idempotency |
| INT-04 | Receipt sequence monotonic | P0 | Multiple payments | Check GD numbers | Strictly increasing, no reuse | Integrity |
| INT-05 | Audit immutability | P0 | Audit entries exist | Try to modify audit via UI/API | Not possible (admin read-only UI; writes via system) | Integrity |
| INT-06 | Balance consistency | P0 | Payments/voids | After void/payment | membership.balance and payments consistent | Integrity |

## 18. End-to-End Flows

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| E2E-01 | New member → membership → payment → attendance | P0 | Owner logged in | Add member, sell membership, collect full payment, check in | All succeed; states consistent | E2E |
| E2E-02 | Renewal flow | P0 | Member membership expiring/expired | Create new membership, collect payment | Renewal recorded | E2E |
| E2E-03 | Partial payment then settle | P0 | Membership created | Pay partial twice until full | Settled correctly | E2E |
| E2E-04 | Freeze → resume cycle | P0 | Active membership | Freeze, then resume | States correct | E2E |
| E2E-05 | Override check-in (admin approval path) | P0 | No active membership, owner does override | Trigger override with reason | Attendance recorded | E2E |
| E2E-06 | Reception workflow (sell+collect) | P0 | Staff logged in | Staff creates member, sells membership, takes payment | All allowed (no admin-only ops) | E2E |
| E2E-07 | Admin-only ops blocked for staff | P0 | Staff logged in | Try void/freeze/expire/cancel/staff mgmt/templates/config | All blocked with "Admin permission required." | E2E |

## 19. UI Regression (Critical Elements)

| TC ID | Test Case | Priority | Precondition | Steps | Expected Result | Test Type |
|---|---|---|---|---|---|---|
| UI-01 | Login form renders | P0 | /login or root | Load app | Email/password fields, Sign in button | UI |
| UI-02 | Dashboard heading exact | P0 | Logged in | Dashboard | "A good day starts here." (h1) | UI |
| UI-03 | Members heading | P0 | Members page | Navigate | "Members" (h1, exact) | UI |
| UI-04 | Search placeholder correct | P0 | Members page | View search | "Search name, phone or member ID" | UI |
| UI-05 | "Add member" button exact (not duplicates) | P0 | Members page | Check button | Exactly one primary "Add member" | UI |
| UI-06 | Modal title "Add a member" | P0 | Click Add member | Open modal | Heading "Add a member" | UI |
| UI-07 | No console errors in normal flow | P0 | Run critical flows | Watch browser console | No uncaught errors | UI |
| UI-08 | Staff sees no Audit nav | P0 | Staff logged in | Check nav | Audit button absent (count==0) | UI |
| UI-09 | Owner sees Audit nav | P0 | Owner logged in | Check nav | Audit button present | UI |
| UI-10 | All 9 nav screens render (owner) | P0 | Owner | Cycle through all pages | Each shows correct h1 | UI |

## Notes
- Seed data: use `Jatin 119` for search tests (present in 150-member seed)
- Receipt GD sequence continues from seed (120 payments created)
- memberDelete: cascades message_logs, attendance, memberships; blocks if payments exist
- gym_action uses request_id idempotency + locking
- All writes via gym_action; reads via get_gym_data snapshot
- DB role values: owner/reception; UI labels: Admin/Staff
- Demo code fully removed; live-only app
