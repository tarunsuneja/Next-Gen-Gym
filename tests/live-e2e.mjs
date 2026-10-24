import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import {
  launch,
  connect,
  read,
  open,
  signIn,
  unique,
} from "./live-harness.mjs";

if (process.env.GYMDESK_ALLOW_LIVE_WRITES !== "disposable")
  throw Error(
    "Live write tests require GYMDESK_ALLOW_LIVE_WRITES=disposable and a disposable seeded database.",
  );
const browser = await launch();
await mkdir("artifacts/live", { recursive: true });
const admin = await connect();
try {
  const before = await read(admin);
  assert.ok(before.plans.length >= 4, "seeded membership plans are present");
  assert.ok(
    before.staff.some((s) => s.role === "owner"),
    "seeded admin staff is present",
  );

  // Reset any leftover coach access from an interrupted run.
  const coachEmail = "coach@gym.local";
  const leftover = before.staff.find((s) => s.email === coachEmail);
  if (leftover)
    await admin.rpc("gym_action", {
      action_type: "staffRemove",
      payload: { id: leftover.id },
      request_id: crypto.randomUUID(),
    });

  const { context, page, errors } = await open(browser);

  // 1. Sign in to the live local Supabase.
  await signIn(page);
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  await page.screenshot({
    path: "artifacts/live/dashboard.png",
    fullPage: true,
    animations: "disabled",
  });

  // Register member, membership and full payment in one submission.
  const name = unique("Live Member"),
    phone = "9" + String(Date.now()).slice(-9);
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill(name);
  await page.getByLabel("Phone number", { exact: true }).fill(phone);
  await page.getByLabel("Gender").selectOption("Female");
  await page.getByLabel("Height (cm)").fill("165");
  await page.getByLabel("Payment method", { exact: true }).selectOption("UPI");
  await page
    .getByLabel("Transaction reference", { exact: true })
    .fill(unique("UPI"));
  await page
    .getByRole("button", { name: "Complete registration", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Payment receipt", exact: true })
    .waitFor();
  let d = await read(admin);
  const member = d.members.find((m) => m.name === name);
  assert(member);
  assert.equal(member.gender, "Female");
  const period = d.memberships.find((s) => s.memberId === member.id);
  const paid = d.payments.find(
    (p) => p.membershipId === period.id && !p.voided,
  );
  assert.equal(paid.amount, period.amount);
  assert.equal(paid.method, "UPI");
  assert.match(paid.receipt, /^GD-\d{6,}$/);
  await page.screenshot({
    path: "artifacts/live/receipt.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Renew", exact: true }).click();
  await page
    .getByRole("button", { name: "Complete membership & payment", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Payment receipt", exact: true })
    .waitFor();
  d = await read(admin);
  assert.equal(
    d.payments.filter((p) => p.memberId === member.id && !p.voided).length,
    2,
  );
  for (const s of d.memberships.filter((s) => s.memberId === member.id))
    assert.equal(
      d.payments
        .filter((p) => p.membershipId === s.id && !p.voided)
        .reduce((a, p) => a + p.amount, 0),
      s.amount,
    );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();

  // 6. Record attendance.
  await page.getByRole("button", { name: "Attendance", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Find a member to check in" })
    .fill(name);
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await page.getByRole("tab", { name: "Inside", exact: true }).click();
  await page
    .locator(".attendance-entry", { hasText: name })
    .getByRole("button", { name: "Check out", exact: true })
    .waitFor();
  d = await read(admin);
  assert.ok(
    d.attendance.some((a) => a.memberId === member.id),
    "attendance recorded in the live database",
  );

  // 7. Grant then revoke staff access for a pre-existing account.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const staffBefore = (await read(admin)).staff.length;
  await page.getByLabel("New staff email", { exact: true }).fill(coachEmail);
  await page
    .getByLabel("New staff role", { exact: true })
    .selectOption("reception");
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  await page.getByText(coachEmail, { exact: true }).waitFor();
  d = await read(admin);
  assert.equal(d.staff.length, staffBefore + 1);
  assert.ok(
    d.staff.some((s) => s.email === coachEmail && s.role === "reception"),
  );
  await page
    .locator(".list-item", { hasText: coachEmail })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await page
    .getByText(coachEmail, { exact: true })
    .waitFor({ state: "detached" });
  assert.equal((await read(admin)).staff.length, staffBefore);

  // 8. Sign out returns to the login screen.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Sign in" }).waitFor();

  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "PASS: live Supabase sign-in, member creation, membership, full registration + renewal payments with GD- receipts, attendance check-in and staff access grants.",
  );
} finally {
  await browser.close();
}
