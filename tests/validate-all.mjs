import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { connect, read } from "./live-harness.mjs";

const owner = await connect("owner@gym.local", "password123");
const staff = await connect("staff@gym.local", "password123");
const coach = await connect("coach@gym.local", "password123");

let passed = 0;
const failures = [];

async function check(label, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${label}`);
  } catch (err) {
    failures.push(`${label} :: ${err.message}`);
    console.log(`  FAIL  ${label} -> ${err.message}`);
  }
}

async function act(client, type, payload, requestId) {
  await client.rpc("gym_action", {
    action_type: type,
    payload,
    request_id: requestId || randomUUID(),
  });
  return read(client);
}

async function expectError(client, type, payload) {
  let threw = false;
  let message = "";
  try {
    await client.rpc("gym_action", {
      action_type: type,
      payload,
      request_id: randomUUID(),
    });
  } catch (err) {
    threw = true;
    message = err.message;
  }
  assert.ok(threw, `expected an error but the action succeeded`);
  return message;
}

const tag = () => randomUUID().replace(/[^a-z0-9]/g, "").slice(0, 8);
function randPhone() {
  let n = "";
  for (let i = 0; i < 9; i++) n += Math.floor(Math.random() * 10);
  return "9" + n;
}
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const addDays = (base, n) => {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};
const addMonths = (base, n) => {
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
};

const today = new Date(iso(new Date()));

async function freshMember(client) {
  const name = `Fresh ${tag()}`;
  const data = await act(client, "member", { name, phone: randPhone() });
  return data.members.find((m) => m.name === name).id;
}

async function freshMembership(client, memberId, extra = {}) {
  const plan = (await read(client)).plans.find((p) => p.months === 1);
  const data = await act(client, "membership", {
    memberId,
    planId: plan.id,
    start: iso(today),
    amount: plan.price,
    dueDate: iso(today),
    ...extra,
  });
  const ms = data.memberships.find((m) => m.memberId === memberId);
  return { id: ms.id, plan, ms };
}

async function createMember(client, extra = {}) {
  const name = `QA ${tag()}`;
  const phone = randPhone();
  await act(client, "member", { name, phone, ...extra });
  const data = await read(client);
  return data.members.find((m) => m.name === name);
}

console.log("\n== 1. Authentication & role access ==");

let ownerData = await read(owner);
const staffData = await read(staff);

await check("owner loads gym, plans and 150+ members", () => {
  assert.ok(ownerData.gym.name.length > 0);
  assert.ok(ownerData.plans.length >= 4);
  assert.ok(ownerData.members.length >= 150);
  assert.equal(ownerData.memberships.length >= 150, true);
});

await check("owner sees staff and audit", () => {
  assert.ok(ownerData.staff.length >= 2);
  assert.ok(Array.isArray(ownerData.audit));
});

await check("reception sees members but not staff/audit", () => {
  assert.ok(staffData.members.length >= 150);
  assert.equal(staffData.staff.length, 0);
  assert.equal(staffData.audit.length, 0);
});

await check("non-staff account is rejected", async () => {
  const message = await expectError(coach, "export", { kind: "check" });
  assert.match(message, /No active gym access|assigned to an active gym/i);
});

console.log("\n== 2. Members: validation ==");

const vName = `Validation ${tag()}`;
const vPhone = randPhone();
let vMemberId;

await check("valid member is created", async () => {
  const data = await act(owner, "member", {
    name: vName,
    phone: vPhone,
    email: "validate@example.com",
    gender: "Male",
    address: "12 Test Road",
    height: "175.5",
    weight: "70",
    dob: "1990-05-10",
    whatsappConsent: true,
  });
  const m = data.members.find((x) => x.name === vName);
  assert.ok(m);
  vMemberId = m.id;
  assert.equal(m.height, "175.5");
  assert.equal(m.dob, "1990-05-10");
});

await check("duplicate phone is rejected", async () => {
  const message = await expectError(owner, "member", {
    name: "Dup",
    phone: vPhone,
  });
  assert.match(message, /already exists/i);
});

await check("shared family phone is allowed", async () => {
  await act(owner, "member", {
    name: `Shared ${tag()}`,
    phone: vPhone,
    sharedPhone: true,
  });
});

await check("invalid phone is rejected", async () => {
  const message = await expectError(owner, "member", {
    name: "Bad",
    phone: "abc",
  });
  assert.match(message, /valid phone/i);
});

await check("invalid email is rejected", async () => {
  const message = await expectError(owner, "member", {
    name: "Bad",
    phone: randPhone(),
    email: "nope",
  });
  assert.match(message, /valid email/i);
});

await check("invalid gender is rejected", async () => {
  const message = await expectError(owner, "member", {
    name: "Bad",
    phone: randPhone(),
    gender: "Other",
  });
  assert.match(message, /Male or Female/i);
});

await check("future date of birth is rejected", async () => {
  const message = await expectError(owner, "member", {
    name: "Bad",
    phone: randPhone(),
    dob: iso(addDays(today, 30)),
  });
  assert.match(message, /future/i);
});

await check("out-of-range height is rejected", async () => {
  const message = await expectError(owner, "member", {
    name: "Bad",
    phone: randPhone(),
    height: "999",
  });
  assert.match(message, /between 50 and 300/i);
});

await check("out-of-range weight is rejected", async () => {
  const message = await expectError(owner, "member", {
    name: "Bad",
    phone: randPhone(),
    weight: "5",
  });
  assert.match(message, /between 10 and 500/i);
});

await check("reception can create a member", async () => {
  const data = await act(staff, "member", {
    name: `Reception ${tag()}`,
    phone: randPhone(),
  });
  assert.ok(data.members.some((m) => m.name.startsWith("Reception ")));
});

console.log("\n== 3. Members: edit / archive / restore ==");

await check("member edit updates fields", async () => {
  const data = await act(owner, "member", {
    id: vMemberId,
    name: vName,
    phone: vPhone,
    notes: "Updated note",
    weight: "72",
    archived: false,
  });
  const m = data.members.find((x) => x.id === vMemberId);
  assert.equal(m.notes, "Updated note");
  assert.equal(m.weight, "72");
});

await check("archiving records a departure date", async () => {
  const data = await act(owner, "member", {
    id: vMemberId,
    name: vName,
    phone: vPhone,
    archived: true,
  });
  const m = data.members.find((x) => x.id === vMemberId);
  assert.equal(m.archived, true);
  assert.ok(m.leftOn);
});

await check("restoring clears the departure date", async () => {
  const data = await act(owner, "member", {
    id: vMemberId,
    name: vName,
    phone: vPhone,
    archived: false,
  });
  assert.equal(data.members.find((x) => x.id === vMemberId).archived, false);
});

console.log("\n== 4. Memberships: create, overlap, discounts ==");

const basic = (await read(owner)).plans.find((p) => p.months === 1);

await check("membership is created from a plan", async () => {
  const data = await act(owner, "membership", {
    memberId: vMemberId,
    planId: basic.id,
    start: iso(today),
    amount: basic.price,
    dueDate: iso(addDays(today, 7)),
  });
  const ms = data.memberships.find((x) => x.memberId === vMemberId);
  assert.ok(ms);
  assert.equal(ms.planName, basic.name);
  assert.equal(ms.end, iso(addDays(addMonths(today, 1), -1)));
});

await check("overlapping membership is rejected", async () => {
  const plan = (await read(owner)).plans.find((p) => p.months === 1);
  const message = await expectError(owner, "membership", {
    memberId: vMemberId,
    planId: plan.id,
    start: iso(addDays(today, 5)),
    amount: 100,
  });
  assert.match(message, /overlap/i);
});

await check("unknown plan is rejected", async () => {
  const message = await expectError(owner, "membership", {
    memberId: vMemberId,
    planId: randomUUID(),
    start: iso(addDays(today, 400)),
    amount: 100,
  });
  assert.match(message, /Plan not found/i);
});

await check("percent discount over 100 is rejected", async () => {
  const plan = (await read(owner)).plans.find((p) => p.months === 1);
  const message = await expectError(owner, "membership", {
    memberId: vMemberId,
    planId: plan.id,
    start: iso(addDays(today, 400)),
    baseAmount: 100000,
    discountType: "percent",
    discountValue: 200,
    amount: 0,
  });
  assert.match(message, /cannot exceed 100/i);
});

await check("fixed discount is applied correctly", async () => {
  const data = await read(owner);
  const plan = data.plans.find((p) => p.months === 1);
  const memberId = await freshMember(owner);
  const out = await act(owner, "membership", {
    memberId,
    planId: plan.id,
    start: iso(today),
    baseAmount: plan.price,
    discountType: "fixed",
    discountValue: 100,
    amount: plan.price - 10000,
    dueDate: iso(today),
  });
  const ms = out.memberships.find((m) => m.memberId === memberId);
  assert.equal(ms.amount, plan.price - 10000);
  assert.equal(ms.baseAmount, plan.price);
  assert.equal(ms.discount, 10000);
});

console.log("\n== 4b. Reception can sell a membership and take payment ==");

let vMembershipId;

await check("reception creates a membership", async () => {
  const memberId = await freshMember(staff);
  const { id } = await freshMembership(staff, memberId);
  vMembershipId = id;
  assert.ok(vMembershipId);
});

await check("reception records a partial payment", async () => {
  const out = await act(staff, "payment", {
    membershipId: vMembershipId,
    amount: 2000,
    method: "UPI",
  });
  const p = out.payments.find((x) => x.membershipId === vMembershipId);
  assert.equal(p.amount, 2000);
  assert.match(p.receipt, /^GD-\d{6,}$/);
});

console.log("\n== 5. Payments, receipts, overpay, void, idempotency ==");

let payMemberId;
let payMembershipId;

await check("setup: member + membership for payment tests", async () => {
  payMemberId = await freshMember(owner);
  const { id } = await freshMembership(owner, payMemberId);
  payMembershipId = id;
  assert.ok(payMembershipId);
});

await check("settled payment completes the plan balance", async () => {
  let data = await act(owner, "payment", {
    membershipId: payMembershipId,
    amount: 50000,
    method: "UPI",
  });
  const planPrice = data.memberships.find((m) => m.id === payMembershipId).amount;
  const paid = data.payments
    .filter((p) => p.membershipId === payMembershipId && !p.voided)
    .reduce((s, p) => s + p.amount, 0);
  data = await act(owner, "payment", {
    membershipId: payMembershipId,
    amount: planPrice - paid,
    method: "Cash",
  });
  const total = data.payments
    .filter((p) => p.membershipId === payMembershipId && !p.voided)
    .reduce((s, p) => s + p.amount, 0);
  assert.equal(total, planPrice);
});

await check("overpayment is rejected", async () => {
  const message = await expectError(owner, "payment", {
    membershipId: payMembershipId,
    amount: 1,
    method: "Cash",
  });
  assert.match(message, /exceed the pending balance/i);
});

await check("zero payment is rejected", async () => {
  const message = await expectError(owner, "payment", {
    membershipId: payMembershipId,
    amount: 0,
    method: "Cash",
  });
  assert.match(message, /positive/i);
});

await check("idempotent payment charges once per request", async () => {
  const memberId = await freshMember(owner);
  const { id } = await freshMembership(owner, memberId);
  const requestId = randomUUID();
  await act(owner, "payment", { membershipId: id, amount: 1000, method: "Cash" }, requestId);
  await act(owner, "payment", { membershipId: id, amount: 1000, method: "Cash" }, requestId);
  const after = await read(owner);
  const count = after.payments.filter((p) => p.membershipId === id).length;
  assert.equal(count, 1);
});

await check("void needs a reason and updates the payment", async () => {
  const data = await read(owner);
  const payment = data.payments.find(
    (p) => p.membershipId === payMembershipId && !p.voided,
  );
  await expectError(owner, "void", { id: payment.id, reason: "no" });
  const out = await act(owner, "void", {
    id: payment.id,
    reason: "Duplicate collection corrected",
  });
  const voided = out.payments.find((p) => p.id === payment.id);
  assert.equal(voided.voided, true);
});

await check("receipt numbers keep incrementing", async () => {
  const data = await read(owner);
  const receipts = data.payments
    .map((p) => Number(p.receipt.replace("GD-", "")))
    .sort((a, b) => a - b);
  assert.ok(receipts.length > 100);
  assert.ok(new Set(receipts).size >= receipts.length - 1);
});

console.log("\n== 6. Lifecycle: freeze / resume / dueDate / edit / expire / cancel ==");

let lMemberId;
let lMembershipId;
let origEnd;

await check("setup: lifecycle member + membership", async () => {
  lMemberId = await freshMember(owner);
  const { id, ms } = await freshMembership(owner, lMemberId);
  lMembershipId = id;
  origEnd = ms.end;
});

await check("freeze in the past is rejected", async () => {
  const message = await expectError(owner, "freeze", {
    id: lMembershipId,
    start: iso(addDays(today, -5)),
    end: iso(addDays(today, -1)),
    reason: "Travel out of town",
  });
  assert.match(message, /within the membership|cannot start in the past/i);
});

await check("valid freeze extends the end date", async () => {
  const out = await act(owner, "freeze", {
    id: lMembershipId,
    start: iso(addDays(today, 1)),
    end: iso(addDays(today, 5)),
    reason: "Travel out of town",
  });
  const ms = out.memberships.find((m) => m.id === lMembershipId);
  assert.equal(ms.end, iso(addDays(new Date(origEnd), 5)));
  assert.ok(ms.freezeStart);
});

await check("resume removes the future freeze", async () => {
  const out = await act(owner, "resume", {
    id: lMembershipId,
    reason: "Returned early",
  });
  const ms = out.memberships.find((m) => m.id === lMembershipId);
  assert.equal(ms.freezeStart, null);
});

await check("due date can be changed", async () => {
  const newDue = iso(addDays(today, 20));
  const out = await act(owner, "dueDate", { id: lMembershipId, dueDate: newDue });
  assert.equal(
    out.memberships.find((m) => m.id === lMembershipId).dueDate,
    newDue,
  );
});

await check("edit cannot drop below collected payments", async () => {
  const message = await expectError(owner, "membershipEdit", {
    id: payMembershipId,
    planName: "Basic Package",
    start: iso(today),
    end: iso(addDays(addMonths(today, 1), -1)),
    amount: 1,
    reason: "Correcting the fee",
  });
  assert.match(message, /less than payments/i);
});

await check("edit updates the period and fee", async () => {
  const out = await act(owner, "membershipEdit", {
    id: lMembershipId,
    planName: "Basic Package",
    start: iso(today),
    end: iso(addDays(addMonths(today, 2), -1)),
    amount: 120000,
    reason: "Extending the package",
  });
  const ms = out.memberships.find((m) => m.id === lMembershipId);
  assert.equal(ms.end, iso(addDays(addMonths(today, 2), -1)));
  assert.equal(ms.amount, 120000);
});

await check("expire moves the end date", async () => {
  const target = iso(addDays(today, 10));
  const out = await act(owner, "membershipExpire", {
    id: lMembershipId,
    endDate: target,
    reason: "Left the gym early",
  });
  assert.equal(
    out.memberships.find((m) => m.id === lMembershipId).end,
    target,
  );
});

await check("cancel marks the membership cancelled", async () => {
  await expectError(owner, "cancel", { id: lMembershipId, reason: "x" });
  const out = await act(owner, "cancel", {
    id: lMembershipId,
    reason: "Member cancelled the plan",
  });
  assert.equal(
    out.memberships.find((m) => m.id === lMembershipId).cancelled,
    true,
  );
});

await check("cancelled membership cannot be frozen", async () => {
  const message = await expectError(owner, "freeze", {
    id: lMembershipId,
    start: iso(addDays(today, 1)),
    end: iso(addDays(today, 3)),
    reason: "On a cancelled plan",
  });
  assert.match(message, /Available membership/i);
});

console.log("\n== 7. Attendance: check-in / checkout / remove ==");

let attendanceId;

await check("active member checks in", async () => {
  const data = await read(owner);
  const ms = data.memberships.find(
    (m) => !m.cancelled && m.start <= iso(today) && m.end >= iso(today),
  );
  assert.ok(ms, "need an active membership");
  const before = data.attendance.length;
  const out = await act(owner, "attendance", { memberId: ms.memberId });
  assert.ok(out.attendance.length >= before);
  attendanceId = out.attendance[out.attendance.length - 1].id;
});

await check("check-in without active membership needs an admin override", async () => {
  const memberId = await freshMember(owner);
  const message = await expectError(owner, "attendance", { memberId });
  assert.match(message, /override/i);
  await act(owner, "attendance", { memberId, override: "Guest trial visit" });
});

await check("reception override requires a reason", async () => {
  const memberId = await freshMember(staff);
  const message = await expectError(staff, "attendance", { memberId });
  assert.match(message, /override/i);
});

await check("checkout closes today's visit", async () => {
  const out = await act(owner, "checkout", { id: attendanceId });
  assert.ok(out.attendance.find((a) => a.id === attendanceId).outAt);
});

await check("double checkout is rejected", async () => {
  const message = await expectError(owner, "checkout", { id: attendanceId });
  assert.match(message, /already checked out/i);
});

await check("attendance removal is admin-only and needs a reason", async () => {
  await expectError(staff, "attendanceRemove", {
    id: attendanceId,
    reason: "Wrong entry",
  });
  await expectError(owner, "attendanceRemove", { id: attendanceId, reason: "x" });
  const out = await act(owner, "attendanceRemove", {
    id: attendanceId,
    reason: "Removed incorrect visit",
  });
  assert.ok(!out.attendance.some((a) => a.id === attendanceId));
});

console.log("\n== 8. Reminders ==");

await check("reminder entry is created and updated", async () => {
  const data = await read(owner);
  const target = data.members[0];
  let out = await act(owner, "reminder", {
    memberId: target.id,
    kind: "call",
    note: "Called about renewal",
    nextDate: iso(addDays(today, 3)),
  });
  const created = out.reminders[out.reminders.length - 1];
  out = await act(owner, "reminder", {
    id: created.id,
    memberId: target.id,
    kind: "whatsapp",
    note: "Sent WhatsApp",
    nextDate: iso(addDays(today, 5)),
  });
  assert.equal(out.reminders.find((r) => r.id === created.id).kind, "whatsapp");
});

console.log("\n== 9. Permissions, settings & plans ==");

await check("reception is blocked from admin settings", async () => {
  const message = await expectError(staff, "settings", { name: "Hacked" });
  assert.match(message, /Admin permission required/i);
});

await check("gym settings are saved", async () => {
  const original = (await read(owner)).gym;
  const out = await act(owner, "settings", {
    name: original.name,
    phone: "9000000001",
    address: "Updated Address, Bengaluru",
  });
  assert.equal(out.gym.phone, "9000000001");
  assert.equal(out.gym.address, "Updated Address, Bengaluru");
});

await check("plan create, edit and delete", async () => {
  const name = `Test Plan ${tag()}`;
  let out = await act(owner, "plan", { name, months: 2, price: 200000 });
  const created = out.plans.find((p) => p.name === name);
  assert.ok(created);
  out = await act(owner, "plan", {
    id: created.id,
    name: `${name} v2`,
    months: 3,
    price: 250000,
  });
  assert.ok(out.plans.find((p) => p.name === `${name} v2`));
  out = await act(owner, "planDelete", { id: created.id });
  assert.ok(!out.plans.some((p) => p.id === created.id));
});

console.log("\n== 10. Staff management ==");

await check("unknown email cannot be added", async () => {
  const message = await expectError(owner, "staffAdd", {
    email: `ghost+${Date.now()}@nowhere.test`,
    role: "reception",
  });
  assert.match(message, /Authentication first/i);
});

await check("existing account is granted access", async () => {
  const out = await act(owner, "staffAdd", {
    email: "coach@gym.local",
    role: "reception",
  });
  assert.ok(out.staff.some((s) => s.email === "coach@gym.local"));
});

await check("duplicate grant is rejected", async () => {
  const message = await expectError(owner, "staffAdd", {
    email: "coach@gym.local",
    role: "reception",
  });
  assert.match(message, /already a staff/i);
});

await check("you cannot remove your own admin access", async () => {
  const me = (await read(owner)).staff.find((s) => s.self);
  const message = await expectError(owner, "staffUpdate", {
    id: me.id,
    role: "reception",
    enabled: true,
  });
  assert.match(message, /your own admin/i);
});

await check("staff role is updated", async () => {
  const data = await read(owner);
  const c = data.staff.find((s) => s.email === "coach@gym.local");
  const out = await act(owner, "staffUpdate", {
    id: c.id,
    role: "owner",
    enabled: true,
  });
  assert.equal(out.staff.find((s) => s.email === "coach@gym.local").role, "owner");
});

await check("staff access is revoked", async () => {
  const data = await read(owner);
  const c = data.staff.find((s) => s.email === "coach@gym.local");
  const out = await act(owner, "staffRemove", { id: c.id });
  assert.ok(!out.staff.some((s) => s.email === "coach@gym.local"));
});

console.log("\n== 11. WhatsApp messaging ==");

await check("seed creates templates and rules", async () => {
  const out = await act(owner, "whatsappSeed", {});
  assert.ok(out.whatsapp.templates.length >= 5);
  assert.ok(out.whatsapp.rules.length >= 5);
});

await check("enabling without a phone number id is rejected", async () => {
  const message = await expectError(owner, "whatsappConfig", {
    enabled: true,
    phoneNumberId: "",
  });
  assert.match(message, /phone number ID/i);
});

await check("config is saved", async () => {
  const out = await act(owner, "whatsappConfig", {
    enabled: false,
    phoneNumberId: "1234567890",
    wabaId: "waba-1",
    displayName: "NGF Gym",
    senderPhone: "9000000000",
    dailySendCap: 150,
    quietStart: "21:00",
    quietEnd: "08:00",
  });
  assert.equal(out.whatsapp.config.phoneNumberId, "1234567890");
  assert.equal(out.whatsapp.config.dailySendCap, 150);
});

await check("unknown template variable is rejected", async () => {
  const message = await expectError(owner, "whatsappTemplate", {
    name: `tpl_${tag()}`,
    category: "utility",
    body: "Hi {{not_allowed}}",
  });
  assert.match(message, /supported template variables/i);
});

await check("template name format is enforced", async () => {
  const message = await expectError(owner, "whatsappTemplate", {
    name: "Bad Name!",
    category: "utility",
    body: "Hi {{member_name}}",
  });
  assert.match(message, /lowercase letters/i);
});

await check("template create, edit and delete", async () => {
  const name = `tpl_${tag()}`;
  let out = await act(owner, "whatsappTemplate", {
    name,
    category: "utility",
    body: "Hi {{member_name}}, see you at {{gym_name}}.",
  });
  const tpl = out.whatsapp.templates.find((t) => t.name === name);
  assert.ok(tpl);
  assert.ok(tpl.variables.includes("member_name"));
  await act(owner, "whatsappTemplate", {
    id: tpl.id,
    name,
    category: "utility",
    body: "Hi {{member_name}}, welcome to {{gym_name}}!",
    isActive: true,
  });
  out = await act(owner, "whatsappTemplateDelete", { id: tpl.id });
  assert.ok(!out.whatsapp.templates.some((t) => t.id === tpl.id));
});

await check("rule with unknown template is rejected", async () => {
  const message = await expectError(owner, "reminderRule", {
    name: "Bad rule",
    offsetDays: 1,
    templateName: "does_not_exist",
    audience: "expiring",
  });
  assert.match(message, /existing template/i);
});

await check("rule create and delete", async () => {
  const data = await read(owner);
  const tpl = data.whatsapp.templates[0];
  const ruleName = `Rule ${tag()}`;
  let out = await act(owner, "reminderRule", {
    name: ruleName,
    offsetDays: 2,
    templateName: tpl.name,
    audience: "expiring",
    isActive: true,
  });
  const rule = out.whatsapp.rules.find((r) => r.name === ruleName);
  assert.ok(rule);
  out = await act(owner, "reminderRuleDelete", { id: rule.id });
  assert.ok(!out.whatsapp.rules.some((r) => r.id === rule.id));
});

console.log("\n== 12. Audit trail & exports ==");

await check("audit records performed actions", async () => {
  const out = await act(owner, "export", { kind: "validation" });
  assert.ok(out.audit.length > 0);
  const actions = out.audit.map((a) => a.action);
  assert.ok(actions.includes("member"));
  assert.ok(actions.includes("payment"));
  assert.ok(actions.includes("export"));
});

console.log("\n== 13. Member deletion rules ==");

await check("member with payment records cannot be deleted", async () => {
  const message = await expectError(owner, "memberDelete", { id: payMemberId });
  assert.match(message, /payment records|archive/i);
});

await check("clean member can be deleted", async () => {
  const memberId = await freshMember(owner);
  const out = await act(owner, "memberDelete", { id: memberId });
  assert.ok(!out.members.some((m) => m.id === memberId));
});

console.log("\n== 14. Guard rails ==");

await check("unknown action is rejected", async () => {
  const message = await expectError(owner, "nonsense", {});
  assert.match(message, /Unsupported action/i);
});

console.log("\n================ SUMMARY ================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failures.length}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("ALL VALIDATION SCENARIOS PASSED");
