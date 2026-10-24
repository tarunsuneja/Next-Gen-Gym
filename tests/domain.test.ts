import { friendlyError } from "../src/errors.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartBuckets, dashWindow, kolkataDay } from "../src/analytics.tsx";
import { seed } from "./fixtures.ts";
import {
  expiry,
  outstanding,
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
  assert.equal(outstanding(d, d.memberships[0]), s.amount);
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
import { whatsappUrl, welcomeMessage, receiptMessage, dueMessage } from "../src/WhatsAppActions";
test("WhatsApp actions encode messages and use recorded payment and balance details", () => {
  const data=seed(), member=data.members[0], payment=data.payments.find(p=>p.memberId===member.id)!;
  assert.equal(whatsappUrl("98765 43210", "Hello & welcome"), "https://wa.me/919876543210?text=Hello%20%26%20welcome");
  assert.equal(whatsappUrl("+91 98765 43210", "Hi"), "https://wa.me/919876543210?text=Hi");
  assert.equal(whatsappUrl("123", "Hi"), null);
  assert.ok(welcomeMessage(data,member).includes(member.name));
  assert.ok(receiptMessage(data,payment).includes(payment.receipt));
  assert.ok(receiptMessage(data,payment).includes(payment.method));
  assert.ok(dueMessage(data,member).includes(member.name));
});
