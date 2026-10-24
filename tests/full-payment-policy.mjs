import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
export async function checkFullPaymentPolicy({
  db,
  action,
  read,
  owner,
  staff,
}) {
  await db.query("select set_config('test.user',$1,false)", [owner]);
  const before = await read();
  await db.exec(
    await readFile("supabase/migrations/017_full_payment_checkout.sql", "utf8"),
  );
  assert.equal(
    (await read()).payments.length,
    before.payments.length,
    "Migration preserves historical payments",
  );
  const oldMember = before.members.find((m) => m.name === "Enrollment member");
  const oldPeriod = before.memberships.find((s) => s.memberId === oldMember.id);
  await assert.rejects(
    () =>
      action("payment", {
        membershipId: oldPeriod.id,
        amount: 100,
        method: "Cash",
      }),
    /full pending balance/,
  );
  await action("payment", {
    membershipId: oldPeriod.id,
    amount: oldPeriod.amount,
    method: "Cash",
  });
  const plan = before.plans.find((p) => p.name === "Enrollment test");
  const purchase = (overrides = {}) => ({
    planId: plan.id,
    start: "2026-10-23",
    end: "2026-11-22",
    amount: 135000,
    baseAmount: 150000,
    discountType: "percent",
    discountValue: 10,
    dueDate: "2026-10-23",
    payment: {
      amount: 135000,
      method: "Cash",
      reference: "",
      requestId: crypto.randomUUID(),
    },
    ...overrides,
  });
  const requestId = crypto.randomUUID(),
    paymentId = crypto.randomUUID();
  const registration = {
    name: "Paid registration",
    phone: "9888877781",
    enrollment: purchase({
      payment: {
        amount: 135000,
        method: "UPI",
        reference: "UPI-TEST-001",
        requestId: paymentId,
      },
    }),
  };
  await action("member", registration, requestId);
  await action("member", registration, requestId);
  const saved = await read(),
    member = saved.members.find((m) => m.name === "Paid registration"),
    period = saved.memberships.find((s) => s.memberId === member.id),
    receipt = saved.payments.find((p) => p.requestId === paymentId);
  assert.equal(
    saved.members.filter((m) => m.name === "Paid registration").length,
    1,
  );
  assert.equal(
    saved.memberships.filter((s) => s.memberId === member.id).length,
    1,
  );
  assert.equal(receipt.amount, 135000);
  assert.equal(receipt.membershipId, period.id);
  assert.equal(
    saved.payments.filter((p) => p.requestId === paymentId).length,
    1,
  );
  await assert.rejects(
    () => action("member", { ...registration, name: "Changed" }, requestId),
    /already used/,
  );
  for (const [i, enrollment] of [
    purchase({ payment: undefined }),
    purchase({
      payment: { amount: 1, method: "Cash", requestId: crypto.randomUUID() },
    }),
    purchase({
      payment: {
        amount: 135000,
        method: "UPI",
        reference: "",
        requestId: crypto.randomUUID(),
      },
    }),
  ].entries()) {
    await assert.rejects(() =>
      action("member", {
        name: `Invalid full sale ${i}`,
        phone: `988887779${i}`,
        enrollment,
      }),
    );
    assert(
      !(await read()).members.some((m) => m.name === `Invalid full sale ${i}`),
      "Failed payment rolls back the new member",
    );
  }
  await assert.rejects(
    () =>
      action("membership", {
        memberId: member.id,
        ...purchase({ start: "2026-10-25" }),
      }),
    /overlap/,
  );
  await assert.rejects(
    () =>
      action("membershipEdit", {
        id: period.id,
        planName: period.planName,
        start: period.start,
        end: period.end,
        amount: 140000,
        reason: "Change paid fee",
      }),
    /Paid membership price/,
  );
  await assert.rejects(
    () =>
      action("membershipEdit", {
        id: period.id,
        planName: "Different paid plan",
        start: period.start,
        end: period.end,
        amount: 135000,
        reason: "Change paid plan",
      }),
    /Paid membership price/,
  );
  const renewalPayment = crypto.randomUUID();
  await db.query("select set_config('test.user',$1,false)", [staff]);
  await action("membership", {
    memberId: member.id,
    ...purchase({
      start: "2026-11-23",
      payment: { amount: 135000, method: "Cash", requestId: renewalPayment },
    }),
  });
  assert(
    (await read()).payments.some((p) => p.requestId === renewalPayment),
    "Staff can complete an existing membership purchase",
  );
  await db.query("select set_config('test.user',$1,false)", [owner]);
  const count = (await read()).payments.length;
  await action("membership", {
    memberId: member.id,
    ...purchase({
      start: "2026-12-23",
      amount: 0,
      discountValue: 100,
      payment: undefined,
    }),
  });
  assert.equal(
    (await read()).payments.length,
    count,
    "Complimentary membership does not invent a payment",
  );
  await action("void", {
    id: receipt.id,
    reason: "Incorrect recorded payment",
  });
  await assert.rejects(
    () =>
      action("payment", {
        membershipId: period.id,
        amount: 50000,
        method: "Cash",
      }),
    /full pending balance/,
  );
  await action("payment", {
    membershipId: period.id,
    amount: 135000,
    method: "Bank transfer",
    reference: "BANK-TEST-001",
  });
  const corrected = await read();
  assert(corrected.payments.find((p) => p.id === receipt.id).voided);
  assert.equal(
    corrected.payments
      .filter((p) => p.membershipId === period.id && !p.voided)
      .reduce((sum, p) => sum + p.amount, 0),
    135000,
  );
  console.log(
    "PASS: full-payment registration/renewal, legacy settlement, idempotent receipts, failed-checkout rollback, paid-price protection, staff purchase, free membership and void/re-entry.",
  );
}
