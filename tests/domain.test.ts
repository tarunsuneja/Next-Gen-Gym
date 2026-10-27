import { attentionGroups } from "../src/features/dashboard/attention";
import { pendingFeeRows } from "../src/features/dashboard/pendingFees";
import { takeInvitation } from "../src/data/invitation";
import { dashboardFixture } from "./fixtures";
import { friendlyError } from "../src/errors.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartBuckets, dashWindow, kolkataDay } from "../src/analytics.tsx";
import { seed } from "./fixtures.ts";
import {
  expiry,
  outstanding,
  balance,
  validatePayment,
  today,
  active,
  id,
  freezeMembership,
  frozen,
  shiftDay,
  overdue,
  normalizePhone,
  memberErrors,
  dueReminders,
  renderTemplate,
  waVariables,
  defaultTemplates,
  defaultRules,
  emptyWhatsAppConfig,
} from "../src/domain.ts";
test("UUID generation works on HTTP Wi-Fi previews without randomUUID", () => {
  const original = Object.getOwnPropertyDescriptor(
    globalThis.crypto,
    "randomUUID",
  );
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: undefined,
    configurable: true,
  });
  try {
    const ids = Array.from({ length: 100 }, () => id());
    assert.equal(new Set(ids).size, 100);
    assert.match(
      ids[0],
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.equal(seed().members.length, 8);
  } finally {
    if (original)
      Object.defineProperty(globalThis.crypto, "randomUUID", original);
    else delete (globalThis.crypto as any).randomUUID;
  }
});
test("hourly collection totals include midnight and month comparisons use matching elapsed dates", () => {
  const payment = {
    ...seed().payments[0],
    at: "2026-10-14T20:30:00Z",
    amount: 5000,
  };
  const chart = chartBuckets("today", "2026-10-15", [payment], kolkataDay);
  assert.equal(chart.buckets.length, 24);
  assert.equal(
    chart.buckets.reduce((sum, b) => sum + b.total, 0),
    5000,
  );
  assert.equal(dashWindow("month", "2026-10-15").prevTo, "2026-09-15");
  assert.equal(dashWindow("month", "2026-03-31").prevTo, "2026-02-28");
});
test("member contact validation matches equivalent phone formats and preserves optional fields", () => {
  assert.equal(normalizePhone("+91 98765-43210"), "9876543210");
  assert.equal(normalizePhone("+44 7700 900123"), "447700900123");
  assert.equal(normalizePhone("abc9876543210"), "");
  const d = seed();
  assert(
    memberErrors(d, { name: "New", phone: "+91 " + d.members[0].phone }).phone,
  );
  assert.deepEqual(
    memberErrors(d, {
      name: "New",
      phone: d.members[0].phone,
      sharedPhone: true,
    }),
    {},
  );
  assert.deepEqual(
    memberErrors(
      d,
      { name: d.members[0].name, phone: d.members[0].phone },
      d.members[0].id,
    ),
    {},
  );
  d.members.push({ ...d.members[0], id: id(), name: "Family member" });
  assert.deepEqual(
    memberErrors(
      d,
      { name: d.members[0].name, phone: d.members[0].phone },
      d.members[0].id,
    ),
    {},
  );
  assert(
    memberErrors(d, {
      name: " ",
      phone: "0000000000",
      email: "invalid",
      height: "NaN",
    }).height,
  );
});
test("freeze eligibility, expiry extension, conflicts and cancellation", () => {
  const d = seed(),
    m = d.members[0],
    s = d.memberships[0],
    original = s.end;
  s.dueDate = shiftDay(today(), -1);
  d.payments[0].voided = true;
  assert.equal(overdue(d, m.id), s.amount);
  d.memberships[0] = freezeMembership(
    d,
    s.id,
    today(),
    shiftDay(today(), 2),
    "Travel pause",
  );
  assert.equal(d.memberships[0].end, shiftDay(original, 3));
  assert.equal(frozen(d.memberships[0]), true);
  assert.equal(active(d, m), false);
  assert.throws(
    () => freezeMembership(d, s.id, today(), today(), "Travel pause"),
    /existing freeze/,
  );
  d.memberships[0].cancelled = true;
  assert.equal(active(d, m), false);
  assert.equal(outstanding(d, d.memberships[0]), 0);
  const another = seed(),
    period = another.memberships[0];
  another.memberships.push({
    ...period,
    id: id(),
    start: shiftDay(period.end, 1),
    end: shiftDay(period.end, 30),
  });
  assert.throws(
    () =>
      freezeMembership(another, period.id, today(), today(), "Travel pause"),
    /overlaps/,
  );
});
test("calendar expiry handles month-end and leap years", () => {
  assert.equal(expiry("2026-01-31", 1), "2026-02-27");
  assert.equal(expiry("2024-01-31", 1), "2024-02-28");
  assert.equal(expiry("2026-10-06", 1), "2026-11-05");
  assert.equal(expiry("2024-02-29", 12), "2025-02-27");
});
test("legacy balances require full settlement and void restoration", () => {
  const d = seed(),
    m = d.memberships[2];
  assert.equal(outstanding(d, m), 70000);
  assert.throws(() => validatePayment(d, m.id, 70001), /full pending/);
  assert.throws(() => validatePayment(d, m.id, 0), /valid/);
  assert.throws(() => validatePayment(d, m.id, 0.5), /valid/);
  assert.throws(() => validatePayment(d, m.id, 50000), /full pending/);
  validatePayment(d, m.id, 70000);
  d.payments[2].voided = true;
  assert.equal(outstanding(d, m), 120000);
});
test("membership eligibility includes expiry day but excludes archive", () => {
  const d = seed(),
    m = d.members[0];
  d.memberships[0].end = today();
  assert.equal(active(d, m), true);
  m.archived = true;
  assert.equal(active(d, m), false);
});
test("WhatsApp reminder engine renders templates, honours consent and de-duplicates", () => {
  const d = seed(),
    day = today(),
    m = d.members[0];
  d.memberships = d.memberships.filter((s) => s.memberId !== m.id);
  d.memberships.push({
    id: id(),
    memberId: m.id,
    planName: "Monthly",
    start: shiftDay(day, -27),
    end: shiftDay(day, 3),
    amount: 150000,
    dueDate: shiftDay(day, 3),
  });
  d.whatsapp = {
    config: { ...emptyWhatsAppConfig(), enabled: true },
    templates: defaultTemplates(),
    rules: defaultRules(),
    messages: [],
  };
  m.whatsappConsent = true;
  const vars = waVariables(d, m.id);
  assert.equal(vars.member_name, m.name);
  assert.equal(vars.days_left, "3");
  assert.equal(vars.amount, "1500");
  assert.equal(renderTemplate("Hi {{member_name}}!", vars), `Hi ${m.name}!`);
  assert.equal(
    dueReminders(d).some(
      (x) => x.memberId === m.id && x.templateName === "renewal_reminder",
    ),
    true,
  );
  m.whatsappConsent = false;
  assert.equal(
    dueReminders(d).some((x) => x.memberId === m.id),
    false,
  );
  m.whatsappConsent = true;
  d.whatsapp.messages.push({
    id: id(),
    memberId: m.id,
    direction: "out",
    templateName: "renewal_reminder",
    phone: m.phone,
    body: "sent",
    status: "sent",
    at: new Date().toISOString(),
  });
  assert.equal(
    dueReminders(d).some(
      (x) => x.memberId === m.id && x.templateName === "renewal_reminder",
    ),
    false,
  );
  d.whatsapp.config.enabled = false;
  assert.equal(dueReminders(d).length, 0);
});

test("fee reminders retain arrears after a paid renewal, preserve paise and allow failed-send retries", () => {
  const d = seed(),
    m = d.members[0],
    day = today();
  d.members = [m];
  m.whatsappConsent = true;
  d.payments = [];
  const arrears = {
    id: id(),
    memberId: m.id,
    planName: "Previous monthly",
    start: shiftDay(day, -29),
    end: day,
    amount: 150025,
    dueDate: shiftDay(day, -3),
  };
  const renewal = {
    id: id(),
    memberId: m.id,
    planName: "Renewed plan",
    start: shiftDay(day, 1),
    end: shiftDay(day, 30),
    amount: 200000,
    dueDate: shiftDay(day, 1),
  };
  d.memberships = [arrears, renewal];
  d.payments = [
    {
      id: id(),
      membershipId: renewal.id,
      memberId: m.id,
      amount: 200000,
      method: "Cash",
      reference: "",
      at: new Date().toISOString(),
      receipt: "TEST",
      voided: false,
      voidReason: "",
    },
  ];
  d.whatsapp = {
    config: { ...emptyWhatsAppConfig(), enabled: true },
    templates: [
      {
        id: id(),
        name: "arrears",
        category: "utility",
        language: "en",
        body: "{{plan_name}}: {{outstanding}} due {{due_date}}",
        variables: ["plan_name", "outstanding", "due_date"],
        status: "draft",
        isActive: true,
      },
    ],
    rules: [
      {
        id: id(),
        name: "Arrears",
        offsetDays: 3,
        templateName: "arrears",
        audience: "has_dues",
        isActive: true,
      },
    ],
    messages: [],
  };
  let q = dueReminders(d, day);
  assert.equal(q.length, 1);
  assert(q[0].body.includes("Previous monthly: 1500.25"));
  d.whatsapp.messages.push({
    id: id(),
    memberId: m.id,
    direction: "out",
    templateName: "arrears",
    phone: m.phone,
    body: q[0].body,
    status: "failed",
    at: new Date().toISOString(),
  });
  assert.equal(dueReminders(d, day).length, 1);
  d.whatsapp.messages[0].status = "sent";
  assert.equal(dueReminders(d, day).length, 0);
  d.whatsapp.messages = [];
  d.payments.push({
    ...d.payments[0],
    id: id(),
    membershipId: arrears.id,
    amount: arrears.amount,
  });
  assert.equal(dueReminders(d, day).length, 0);
  d.payments[d.payments.length - 1].voided = true;
  assert.equal(dueReminders(d, day).length, 1);
  m.archived = true;
  assert.equal(dueReminders(d, day).length, 0);
});

test("database error objects retain readable messages and session errors remain actionable", () => {
  assert.equal(
    friendlyError({ code: "P0001", message: "No active gym access." }),
    "No active gym access.",
  );
  assert.equal(
    friendlyError({ code: "PGRST301", message: "JWT expired" }),
    "Your session has expired. Please sign in again.",
  );
  assert.equal(
    friendlyError({ message: "Payment exceeds the pending balance." }),
    "Payment exceeds the pending balance.",
  );
});
import {
  whatsappUrl,
  welcomeMessage,
  receiptMessage,
  dueMessage,
} from "../src/WhatsAppActions";
test("WhatsApp actions encode messages and use recorded payment and balance details", () => {
  const data = seed(),
    member = data.members[0],
    payment = data.payments.find((p) => p.memberId === member.id)!;
  assert.equal(
    whatsappUrl("98765 43210", "Hello & welcome"),
    "https://wa.me/919876543210?text=Hello%20%26%20welcome",
  );
  assert.equal(
    whatsappUrl("+91 98765 43210", "Hi"),
    "https://wa.me/919876543210?text=Hi",
  );
  assert.equal(whatsappUrl("123", "Hi"), null);
  assert.ok(welcomeMessage(data, member).includes(member.name));
  assert.ok(receiptMessage(data, payment).includes(payment.receipt));
  assert.ok(receiptMessage(data, payment).includes(payment.method));
  assert.ok(dueMessage(data, member).includes(member.name));
});
import { buildWorkspaceIndex } from "../src/domain/workspaceIndex";
import { parseWorkspace } from "../src/data/workspaceContract";
import {
  commitAndRefresh,
  CommittedRefreshError,
} from "../src/data/commandResult";
import { affectedSections } from "../src/data/invalidation";
test("indexed balances preserve void, cancellation and historical balance semantics", () => {
  const data = seed();
  data.payments[0].voided = true;
  data.memberships[0].cancelled = true;
  const index = buildWorkspaceIndex(data);
  for (const member of data.members)
    assert.equal(index.balance(member.id), balance(data, member.id));
  for (const membership of data.memberships)
    assert.equal(index.outstanding(membership), outstanding(data, membership));
});
test("workspace boundary rejects malformed data and unsafe money without discarding optional fields", () => {
  const data = seed();
  assert.equal(parseWorkspace(data), data);
  assert.throws(() => parseWorkspace({ ...data, members: null }), /members/);
  assert.throws(
    () =>
      parseWorkspace({
        ...data,
        payments: [{ ...data.payments[0], amount: Infinity }],
      }),
    /amount/,
  );
  assert.throws(() => parseWorkspace({ ...data, gym: null }), /gym/);
});
test("a failed refresh after commit is distinct from a rejected command", async () => {
  let writes = 0;
  await assert.rejects(
    () =>
      commitAndRefresh(
        "stable",
        async () => {
          writes++;
        },
        async () => {
          throw Error("offline");
        },
      ),
    (error) =>
      error instanceof CommittedRefreshError &&
      error.committed &&
      error.requestId === "stable",
  );
  assert.equal(writes, 1);
  let reads = 0;
  await assert.rejects(
    () =>
      commitAndRefresh(
        "stable",
        async () => {
          throw Error("rejected");
        },
        async () => {
          reads++;
          return null;
        },
      ),
    /rejected/,
  );
  assert.equal(reads, 0);
  assert(
    affectedSections({
      type: "memberDelete",
      payload: { id: "test" },
    }).includes("attendance"),
  );
  assert.deepEqual(
    affectedSections({ type: "checkout", payload: { id: "test" } }),
    ["audit", "attendance"],
  );
});
import { BoundedCache } from "../src/shared/BoundedCache";
import { latest } from "../src/domain";
test("performance indexes preserve eligibility, latest period and overdue semantics", () => {
  const data = seed(),
    index = buildWorkspaceIndex(data);
  for (const member of data.members) {
    assert.equal(index.active(member.id), active(data, member));
    assert.equal(index.latest(member.id)?.id, latest(data, member.id)?.id);
    assert.equal(index.overdue(member.id), overdue(data, member.id));
  }
});
test("bounded photo cache expires entries, evicts least recently used values and clears sessions", () => {
  let now = 0;
  const cache = new BoundedCache<string, number>(2, 100, () => now);
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1);
  cache.set("c", 3);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.size, 2);
  now = 101;
  assert.equal(cache.get("a"), undefined);
  cache.clear();
  assert.equal(cache.size, 0);
});
test("chart aggregation converts timestamps once per payment and retains daily amounts", () => {
  const data = seed();
  let calls = 0;
  const chart = chartBuckets("30", today(), data.payments, (iso) => {
    calls++;
    return kolkataDay(iso);
  });
  assert.equal(calls, data.payments.length);
  for (const bucket of chart.buckets)
    assert.equal(
      bucket.total,
      data.payments
        .filter((p) => kolkataDay(p.at) === bucket.key)
        .reduce((s, p) => s + p.amount, 0),
    );
});
import { dashboardMetrics } from "../src/features/dashboard/selectors";
test("memoized dashboard selector preserves totals across every date range", () => {
  const data = seed(),
    day = today(),
    index = buildWorkspaceIndex(data);
  for (const range of ["today", "7", "30", "month"] as const) {
    const metrics = dashboardMetrics(data, day, range, range, index);
    const window = dashWindow(range, day);
    const payments = data.payments.filter(
      (p) =>
        !p.voided &&
        kolkataDay(p.at) >= window.from &&
        kolkataDay(p.at) <= window.to,
    );
    assert.equal(
      metrics.rangeCash,
      payments.reduce((sum, p) => sum + p.amount, 0),
    );
    assert.equal(metrics.rangePayments.length, payments.length);
    assert.equal(
      metrics.pending,
      data.members.reduce((sum, m) => sum + balance(data, m.id), 0),
    );
    assert.equal(
      metrics.activeCount,
      data.members.filter((m) => active(data, m)).length,
    );
    assert.equal(
      metrics.rangeJoins,
      data.members.filter(
        (m) => m.joined >= window.from && m.joined <= window.to,
      ).length,
    );
  }
});

import { mergeWorkspaceSections } from "../src/data/workspaceContract";
test("scoped refresh validates changed rows without traversing retained history", () => {
  const previous = seed();
  const payments = new Proxy(previous.payments, {
    get(target, key, receiver) {
      if (key === "entries") throw Error("Unchanged history was traversed");
      return Reflect.get(target, key, receiver);
    },
  });
  const retained = { ...previous, payments };
  const merged = mergeWorkspaceSections(
    retained,
    { plans: previous.plans, payments: [] },
    ["plans"],
  );
  assert.equal(merged.payments, payments);
  assert.equal(merged.members, previous.members);
  assert.throws(
    () =>
      mergeWorkspaceSections(
        previous,
        { plans: [{ id: "x", name: "Bad", price: NaN }] },
        ["plans"],
      ),
    /plans/,
  );
  assert.throws(
    () => mergeWorkspaceSections(previous, {}, ["payments"]),
    /payments/,
  );
  assert.throws(
    () => mergeWorkspaceSections(previous, { payments: null }, ["payments"]),
    /payments/,
  );
});

import { csvBlob, csvRow } from "../src/shared/csv";
test("batched CSV is byte-compatible across batch boundaries and protects formulas", async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => [
    i,
    'a,"b',
    "=SUM(A1)",
    "₹1500",
  ]);
  const expected = Buffer.from(
    "\uFEFF" +
      rows
        .map((row) =>
          row
            .map(
              (cell) =>
                '"' +
                String(cell)
                  .replace(/^[=+@-]/, "'")
                  .replaceAll('"', '""') +
                '"',
            )
            .join(","),
        )
        .join("\r\n"),
  );
  const blob = await csvBlob(rows);
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()), expected);
  assert.equal(
    csvRow(["+cmd", "@x", "-1", "normal"]),
    `"'cmd","'x","'1","normal"`,
  );
  assert.deepEqual(
    Buffer.from(await (await csvBlob([])).arrayBuffer()),
    Buffer.from("\uFEFF"),
  );
});

import { exportPages, parseExportPage } from "../src/data/exportContract";
import { csvPagedBlob } from "../src/shared/csv";
test("receipt exports retain one revision, traverse every page and stop on edits or cancellation", async () => {
  const controller = new AbortController();
  const records = Array.from({ length: 503 }, (_, i) => ({
    id: `10000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    at: "2026-10-24T06:00:00+00:00",
    cells: [`GD-${i}`, "Member", "2026-10-24", "Cash", 1500.25, "Valid"],
  }));
  const revisions = [];
  const pages = exportPages(async (after, revision) => {
    revisions.push(revision);
    const offset = after ? records.findIndex((r) => r.id === after.id) + 1 : 0;
    const rows = records.slice(offset, offset + 250);
    const hasMore = offset + rows.length < records.length;
    const last = rows.at(-1);
    return {
      revision: "10000000-0000-0000-0000-000000000001:9007199254740993",
      rows,
      hasMore,
      nextCursor: hasMore ? { at: last.at, id: last.id } : null,
    };
  }, controller.signal);
  const blob = await csvPagedBlob(["Receipt"], pages, controller.signal);
  assert.deepEqual(revisions, [
    undefined,
    "10000000-0000-0000-0000-000000000001:9007199254740993",
    "10000000-0000-0000-0000-000000000001:9007199254740993",
  ]);
  assert.equal((await blob.text()).split("\r\n").length, 504);
  assert((await blob.text()).includes("GD-502"));
  assert.throws(
    () =>
      parseExportPage(
        {
          revision: "10000000-0000-0000-0000-000000000001:2",
          rows: [],
          hasMore: false,
          nextCursor: null,
        },
        null,
        "10000000-0000-0000-0000-000000000001:1",
      ),
    /changed/,
  );
  assert.throws(
    () =>
      parseExportPage(
        {
          revision: "10000000-0000-0000-0000-000000000001:1",
          rows: records.slice(0, 250).reverse(),
          hasMore: false,
          nextCursor: null,
        },
        null,
      ),
    /Invalid/,
  );
  assert.throws(
    () =>
      parseExportPage(
        {
          revision: "10000000-0000-0000-0000-000000000001:1",
          rows: [],
          hasMore: true,
          nextCursor: null,
        },
        null,
      ),
    /Invalid/,
  );
  let calls = 0;
  controller.abort();
  await assert.rejects(async () => {
    for await (const _page of exportPages(async () => {
      calls++;
      return {};
    }, controller.signal)) {
    }
  }, /abort/i);
  assert.equal(calls, 0);
});

test("export cursors preserve PostgreSQL microsecond ordering", () => {
  const cells = ["Receipt", "Member", "Date", "Cash", 1500.25, "Valid"];
  const rows = [
    {
      id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      at: "2026-10-24T06:00:00.000001+00:00",
      cells,
    },
    {
      id: "00000000-0000-0000-0000-000000000000",
      at: "2026-10-24T06:00:00.000002+00:00",
      cells,
    },
  ];
  assert.equal(
    parseExportPage(
      {
        revision: "10000000-0000-0000-0000-000000000001:1",
        rows,
        hasMore: false,
        nextCursor: null,
      },
      null,
    ).rows.length,
    2,
  );
  assert.throws(
    () =>
      parseExportPage(
        {
          revision: "10000000-0000-0000-0000-000000000001:1",
          rows: [rows[1], rows[0]],
          hasMore: false,
          nextCursor: null,
        },
        null,
      ),
    /Invalid/,
  );
});

import { dashboardFixture } from "./fixtures";
import { requiresFullHistory } from "../src/data/readModel";
test("compact dashboard preserves lifetime dues, all ranges, charts and visit metrics", () => {
  const full = seed(),
    day = today();
  const payment = full.payments[0],
    visit = full.attendance[0];
  for (let i = 0; i < 240; i++) {
    const date = shiftDay(day, -(i % 75));
    full.payments.push({
      ...payment,
      id: id(),
      receipt: `PARITY-${i}`,
      at: date + "T00:00:00.000Z",
      amount: 1051 + i,
      voided: i % 7 === 0,
    });
    full.attendance.push({
      ...visit,
      id: id(),
      day: date,
      at: date + "T00:00:00.000Z",
    });
  }
  full.payments.sort(
    (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
  );
  full.attendance.sort(
    (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
  );
  const compact = dashboardFixture(full),
    index = buildWorkspaceIndex(compact);
  assert(compact.payments.length <= 5);
  assert(compact.attendance.length < full.attendance.length);
  for (const m of full.members) {
    assert.equal(index.balance(m.id), balance(full, m.id));
    assert.equal(balance(compact, m.id), balance(full, m.id));
    assert.equal(index.overdue(m.id, day), overdue(full, m.id));
  }
  for (const range of ["today", "7", "30", "month"] as const)
    for (const chartRange of ["today", "7", "30", "month"] as const) {
      const before = dashboardMetrics(
        full,
        day,
        range,
        chartRange,
        buildWorkspaceIndex(full),
      );
      const after = dashboardMetrics(compact, day, range, chartRange, index);
      for (const field of [
        "pending",
        "activeCount",
        "rangeCash",
        "prevCash",
        "rangePaymentCount",
        "rangeJoins",
        "prevJoins",
        "rangeVisits",
        "prevVisits",
        "chartTotal",
      ] as const)
        assert.equal(
          after[field],
          before[field],
          `${range}/${chartRange}/${field}`,
        );
      assert.deepEqual(after.chart, before.chart);
      assert.deepEqual(after.checkins, before.checkins);
    }
  assert.doesNotThrow(() => parseWorkspace(compact));
  const damaged = structuredClone(compact);
  damaged.dashboard!.hours = [{ hour: 24, amount: 1 }];
  assert.throws(() => parseWorkspace(damaged), /dashboard/);
  const context = {
    page: "Dashboard",
    modal: false,
    member: false,
    search: false,
  };
  assert.equal(requiresFullHistory(compact, context), false);
  for (const page of [
    "Members",
    "Fees & receipts",
    "Attendance",
    "Reminders",
    "Settings",
    "Reports",
    "Audit",
  ])
    assert(requiresFullHistory(compact, { ...context, page }));
  for (const key of ["modal", "member", "search"])
    assert(requiresFullHistory(compact, { ...context, [key]: true }));
  assert.equal(
    requiresFullHistory(full, { ...context, page: "Reports" }),
    false,
  );
});

import { operationalLists } from "../src/app/operationalLists";
test("operational filtering retains date, void, inside and search semantics only on active pages", () => {
  const data = seed(),
    members = new Map(data.members.map((m) => [m.id, m])),
    day = today();
  const base = {
    page: "Fees & receipts",
    query: "",
    filter: "All",
    attendanceTab: "History",
    day,
    range: null,
  };
  assert.deepEqual(
    operationalLists(data, members, base).visiblePayments,
    data.payments,
  );
  const todayPayments = data.payments.filter(
    (p) => !p.voided && kolkataDay(p.at) === day,
  );
  assert.deepEqual(
    operationalLists(data, members, { ...base, filter: "Today" })
      .visiblePayments,
    todayPayments,
  );
  assert.deepEqual(
    operationalLists(data, members, { ...base, range: { from: day, to: day } })
      .visiblePayments,
    todayPayments,
  );
  const visits = data.attendance.filter((a) => a.day === day && !a.outAt);
  assert.deepEqual(
    operationalLists(data, members, {
      ...base,
      page: "Attendance",
      attendanceTab: "Inside",
    }).attendanceRows,
    visits,
  );
  const query = data.members[0].phone;
  assert.deepEqual(
    operationalLists(data, members, { ...base, page: "Attendance", query })
      .attendanceRows,
    data.attendance.filter((a) => {
      const m = members.get(a.memberId);
      return `${m?.name} ${m?.phone}`.includes(query);
    }),
  );
  const guarded = new Proxy(data.payments, {
    get() {
      throw Error("Dashboard must not scan receipt history");
    },
  });
  assert.deepEqual(
    operationalLists({ ...data, payments: guarded }, members, {
      ...base,
      page: "Dashboard",
    }),
    { visiblePayments: [], attendanceRows: [] },
  );
});

test("joining date rejects invalid and future dates independently of membership start", () => {
  const data = seed();
  assert.equal(memberErrors(data, { joined: today() }).joined, undefined);
  assert.equal(memberErrors(data, { joined: "2000-01-01" }).joined, undefined);
  assert(memberErrors(data, { joined: "2026-02-30" }).joined);
  assert(memberErrors(data, { joined: shiftDay(today(), 1) }).joined);
});

test("pending fees retain every debtor including new members and future due dates", () => {
  const data = seed();
  for (let i = 0; i < 16; i++) {
    const member = {
      ...data.members[0],
      id: `pending-${i}`,
      name: `Pending member ${i}`,
      joined: today(),
      archived: false,
    };
    data.members.push(member);
    data.memberships.push({
      ...data.memberships[0],
      id: `pending-period-${i}`,
      memberId: member.id,
      start: today(),
      end: shiftDay(today(), 29),
      dueDate: shiftDay(today(), 3),
      amount: 120000,
      cancelled: false,
    });
  }
  const rows = pendingFeeRows(data);
  assert.equal(rows.filter((r) => r.id.startsWith("pending-")).length, 16);
  assert.equal(rows.find((r) => r.id === "pending-15")?.amount, 120000);
  assert.equal(
    rows.find((r) => r.id === "pending-15")?.due,
    shiftDay(today(), 3),
  );
  assert.deepEqual(pendingFeeRows(dashboardFixture(data)), rows);
});

test("admin invite tokens are consumed once without changing regular PKCE or recovery URLs", () => {
  const invite = new URL(
    "https://gym.example/?next=dashboard#type=invite&access_token=access-test&refresh_token=refresh-test",
  );
  assert.deepEqual(takeInvitation(invite), {
    access_token: "access-test",
    refresh_token: "refresh-test",
  });
  assert.equal(invite.hash, "");
  assert.equal(invite.search, "?next=dashboard");
  assert.equal(takeInvitation(invite), null);
  for (const link of [
    "https://gym.example/?code=pkce",
    "https://gym.example/#type=recovery&access_token=a&refresh_token=b",
    "https://gym.example/#type=invite&access_token=a",
  ]) {
    const url = new URL(link);
    assert.equal(takeInvitation(url), null);
    assert.equal(url.href, link);
  }
});

test("pending fees and expiry reminders represent independent lifecycle states", () => {
  const source = seed();
  const data = {
    ...source,
    members: [],
    memberships: [],
    payments: [],
    attendance: [],
  } as typeof source;
  function add(
    name: string,
    options: {
      paid?: boolean;
      expiry?: number;
      start?: number;
      cancelled?: boolean;
      archived?: boolean;
      joined?: number;
      voided?: boolean;
    } = {},
  ) {
    const member = {
      ...source.members[0],
      id: name,
      name,
      joined: shiftDay(today(), options.joined ?? -60),
      archived: !!options.archived,
    };
    const period = {
      ...source.memberships[0],
      id: `${name}-period`,
      memberId: name,
      start: shiftDay(today(), options.start ?? -30),
      end: shiftDay(today(), options.expiry ?? 30),
      cancelled: !!options.cancelled,
      amount: 120000,
      dueDate: shiftDay(today(), 3),
    };
    data.members.push(member);
    data.memberships.push(period);
    if (options.paid || options.voided)
      data.payments.push({
        ...source.payments[0],
        id: `${name}-receipt`,
        membershipId: period.id,
        memberId: name,
        amount: 120000,
        voided: !!options.voided,
      });
    return period;
  }
  add("New unpaid", { start: 0, joined: 0 });
  add("Paid expiring", { paid: true, expiry: 2 });
  add("Unpaid expiring", { expiry: 2 });
  add("Paid expired", { paid: true, expiry: -1 });
  add("Cancelled unpaid", { cancelled: true, expiry: 2 });
  add("Archived unpaid", { archived: true, expiry: 2 });
  add("Future paid", { paid: true, start: 3, expiry: 33 });
  add("Voided payment", { voided: true });
  add("Recent start", { paid: true, start: 0, joined: -60 });
  add("Fourteen days absent", { paid: true, start: -14 });
  data.members.push({ ...source.members[0], id: "No plan", name: "No plan", archived: false });
  const groups = attentionGroups(data, today());
  const has = (category: Parameters<typeof groups.get>[0] | "Pending payments", name: string) =>
    category === "Pending payments" ? pendingFeeRows(data).some((r) => r.id === name) : groups.get(category)!.some((m) => m.id === name);
  for (const name of [
    "New unpaid",
    "Unpaid expiring",
    "Archived unpaid",
    "Voided payment",
  ])
    assert(has("Pending payments", name));
  for (const name of ["Paid expiring", "Unpaid expiring", "Paid expired"])
    assert(has("Expiring memberships", name));
  for (const name of [
    "New unpaid",
    "Archived unpaid",
    "Cancelled unpaid",
    "Future paid",
  ])
    assert(!has("Expiring memberships", name));
  assert(!has("Pending payments", "Paid expiring"));
  assert(!has("Pending payments", "Cancelled unpaid"));
  assert(!has("Absent 14+ days", "Recent start"));
  assert(!has("Absent 14+ days", "Future paid"));
  assert(has("Absent 14+ days", "Fourteen days absent"));
  assert(has("Members without a plan", "No plan"));
  assert(has("Members without a plan", "Cancelled unpaid"));
  assert(!has("Members without a plan", "Future paid"));
  assert.deepEqual(attentionGroups(dashboardFixture(data), today()), groups);
});
