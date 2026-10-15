import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({
  executablePath: process.env.GYMDESK_BROWSER_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
const read = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("gymdesk-demo-v1")));
const openMember = (name) =>
  page.getByRole("button", { name: "Open " + name, exact: true }).click();
const dialog = () => page.getByRole("dialog");
const saveModal = async () => {
  await dialog().getByRole("button", { name: "Save", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
};

try {
  await mkdir("artifacts/lifecycles", { recursive: true });
  await page.goto(process.env.GYMDESK_TEST_URL || "http://127.0.0.1:5173/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  const today = await page.evaluate(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
      new Date(),
    ),
  );

  // ---------------------------------------------------------------------------
  // 1. Soft delete (archive) lifecycle: archive -> filter -> restore -> hard delete
  // ---------------------------------------------------------------------------
  await page.getByRole("button", { name: "Members", exact: true }).click();
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await dialog()
    .getByLabel(/Full name/)
    .fill("Soft Delete Person");
  await dialog()
    .getByLabel(/Phone number/)
    .fill("9876500001");
  await saveModal();
  let d = await read();
  const soft = d.members.find((m) => m.name === "Soft Delete Person");
  assert.ok(soft && soft.archived === false, "new member added unarchived");

  // Archive from the profile button (owner/any role), confirm() auto-accepted
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  d = await read();
  assert.equal(
    d.members.find((m) => m.id === soft.id).archived,
    true,
    "profile Archive = soft delete keeps the row",
  );
  await page.getByText("Archived", { exact: true }).first().waitFor();

  // Archived members are hidden from Active and listed under Archived
  await page
    .getByRole("button", { name: "Back to Members", exact: true })
    .click();
  const filter = () => page.getByLabel("Member status filter", { exact: true });
  await filter().selectOption("Active");
  assert.equal(
    await page
      .getByRole("button", { name: "Open Soft Delete Person", exact: true })
      .count(),
    0,
    "archived member hidden under Active",
  );
  await filter().selectOption("Archived");
  await openMember("Soft Delete Person");

  // Restore from the profile button
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  d = await read();
  assert.equal(
    d.members.find((m) => m.id === soft.id).archived,
    false,
    "profile Restore brings the member back",
  );

  // Hard delete (no financial history) -> removed entirely
  await page
    .getByRole("button", { name: "Delete member", exact: true })
    .click();
  await dialog().getByRole("checkbox").check();
  await dialog()
    .getByRole("button", { name: "Delete member", exact: true })
    .click();
  await dialog().waitFor({ state: "hidden" });
  d = await read();
  assert.ok(
    !d.members.some((m) => m.id === soft.id),
    "hard delete removes the member row",
  );

  // ---------------------------------------------------------------------------
  // 2. Full member lifecycle: add -> membership -> payment -> attendance -> follow-up
  //    -> archive WITH history (delete blocked) -> restore
  // ---------------------------------------------------------------------------
  await page.getByRole("button", { name: "Members", exact: true }).click();
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await dialog()
    .getByLabel(/Full name/)
    .fill("Lifecycle Person");
  await dialog()
    .getByLabel(/Phone number/)
    .fill("9876500002");
  await saveModal();
  d = await read();
  const life = d.members.find((m) => m.name === "Lifecycle Person");
  assert.ok(life);

  // Membership
  await page
    .getByRole("button", { name: "Add membership", exact: true })
    .click();
  await saveModal();
  d = await read();
  assert.ok(
    d.memberships.find((s) => s.memberId === life.id)?.planName === "Monthly",
    "membership created with default plan",
  );

  // Payment: partial -> void test stays in operations; here collect full outstanding
  await page
    .getByRole("button", { name: "Collect payment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use full outstanding amount", exact: true })
    .click();
  await dialog()
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Payment receipt", exact: true })
    .waitFor();
  d = await read();
  const pay = d.payments.find((p) => p.memberId === life.id);
  assert.ok(pay && !pay.voided, "payment record + receipt");
  await page.getByLabel("Close dialog", { exact: true }).click();

  // Attendance check-in
  await page.getByRole("button", { name: "Attendance", exact: true }).click();
  await page.getByLabel(/Find a member to check in/).fill("Lifecycle Person");
  await page
    .getByRole("button", { name: "Check in", exact: true })
    .first()
    .click();
  await page.getByText("Inside", { exact: true }).first().waitFor();
  d = await read();
  assert.ok(
    d.attendance.some((a) => a.memberId === life.id),
    "check-in recorded",
  );
  const originalCheckin = d.attendance.find((a) => a.memberId === life.id);
  await page
    .locator(".list-item", { hasText: "Lifecycle Person" })
    .getByRole("button", { name: "Correct check-in", exact: true })
    .click();
  await dialog()
    .getByLabel("Correction reason", { exact: true })
    .fill("Mistaken check-in correction");
  await saveModal();
  d = await read();
  assert(!d.attendance.some((a) => a.id === originalCheckin.id));
  assert(
    d.audit.some(
      (a) =>
        a.action === "attendanceRemove" &&
        a.payload.removedAttendance.id === originalCheckin.id,
    ),
  );
  await page
    .getByRole("button", { name: "Check in", exact: true })
    .first()
    .click();
  await page.getByText("Inside", { exact: true }).first().waitFor();

  // Follow-up (contact log)
  await page.getByRole("button", { name: "Members", exact: true }).click();
  await openMember("Lifecycle Person");
  await page
    .getByRole("button", { name: "Log follow-up", exact: true })
    .click();
  await dialog()
    .getByLabel(/Contact type/)
    .selectOption("WhatsApp");
  await dialog()
    .getByLabel(/Contact notes/)
    .fill("Discussed renewal options.");
  await dialog()
    .getByLabel(/Next follow-up date/)
    .fill(today);
  await saveModal();
  d = await read();
  assert.ok(
    d.reminders.some((r) => r.memberId === life.id && r.kind === "WhatsApp"),
    "follow-up logged",
  );
  const contact = d.reminders.find((r) => r.memberId === life.id);
  await page
    .getByRole("button", { name: `Edit contact ${contact.id}`, exact: true })
    .click();
  assert.equal(
    await dialog()
      .getByLabel(/Contact notes/)
      .inputValue(),
    "Discussed renewal options.",
  );
  await dialog()
    .getByLabel(/Contact notes/)
    .fill("Rescheduled with the member.");
  await dialog()
    .getByLabel(/Next follow-up date/)
    .fill("");
  await saveModal();
  d = await read();
  assert.equal(d.reminders.filter((r) => r.memberId === life.id).length, 1);
  assert.equal(d.reminders.find((r) => r.id === contact.id).at, contact.at);
  assert.equal(d.reminders.find((r) => r.id === contact.id).nextDate, "");

  // Archive with history: delete must be blocked, data preserved
  await page.getByRole("button", { name: "Edit member", exact: true }).click();
  await dialog()
    .getByLabel(/Archive member/)
    .check();
  await saveModal();
  d = await read();
  assert.equal(d.members.find((m) => m.id === life.id).archived, true);
  assert.ok(
    d.payments.some((p) => p.memberId === life.id),
    "payments kept",
  );
  assert.ok(
    d.attendance.some((a) => a.memberId === life.id),
    "attendance kept",
  );
  assert.ok(
    d.reminders.some((r) => r.memberId === life.id),
    "follow-ups kept",
  );

  await page
    .getByRole("button", { name: "Delete member", exact: true })
    .click();
  await dialog().getByRole("checkbox").check();
  await dialog()
    .getByRole("button", { name: "Delete member", exact: true })
    .click();
  await page
    .locator(".form-error-summary", { hasText: /payment records/ })
    .waitFor();
  assert.ok(
    (await read()).members.some((m) => m.id === life.id),
    "delete blocked for member with payments",
  );
  await dialog().getByRole("button", { name: "Cancel", exact: true }).click();

  // Restore
  await page.getByRole("button", { name: "Edit member", exact: true }).click();
  await dialog()
    .getByLabel(/Archive member/)
    .uncheck();
  await saveModal();
  assert.equal(
    (await read()).members.find((m) => m.id === life.id).archived,
    false,
  );

  // ---------------------------------------------------------------------------
  // 3. Messages UI lifecycle: setup -> seed -> queue -> send -> log -> template/rule CRUD
  // ---------------------------------------------------------------------------
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  await page.getByLabel(/Phone number ID/).fill("123456789012345");
  await page.getByLabel(/Enable automated sending/).check();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  d = await read();
  assert.equal(d.whatsapp.config.phoneNumberId, "123456789012345");
  assert.equal(d.whatsapp.config.enabled, true);

  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page.getByRole("button", { name: "Add defaults", exact: true }).click();
  d = await read();
  assert.equal(d.whatsapp.templates.length, 5, "default templates seeded");
  assert.equal(d.whatsapp.rules.length, 5, "default rules seeded");

  await page.getByRole("button", { name: /Queue/ }).click();
  const queueRows = page.locator(".reminder-row");
  assert.ok((await queueRows.count()) >= 1, "queue has due reminders");
  await queueRows.first().getByText("Priya Sharma", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Send now", exact: true }).click();
  d = await read();
  assert.ok(
    d.whatsapp.messages.filter((m) => m.direction === "out").length >= 1,
    "messages sent on queue dispatch",
  );
  await page.getByRole("button", { name: "Log", exact: true }).click();
  assert.ok(
    (await page.locator(".list-item").count()) >= 1,
    "message log populated",
  );

  // Template add + edit + delete
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page.getByRole("button", { name: "New template", exact: true }).click();
  await page.getByLabel(/Name/).fill("lifecycle_test");
  await page.getByLabel(/Message body/).fill("Hi {{member_name}}!");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .waitFor({ state: "hidden" });
  d = await read();
  const tpl = d.whatsapp.templates.find((t) => t.name === "lifecycle_test");
  assert.ok(tpl, "template created");

  await page
    .locator(".list-item", { hasText: "lifecycle_test" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.getByLabel(/Message body/).fill("Hi {{member_name}}, updated!");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    (await read()).whatsapp.templates.find((t) => t.id === tpl.id).body,
    "Hi {{member_name}}, updated!",
    "template edited",
  );

  await page
    .locator(".list-item", { hasText: "lifecycle_test" })
    .locator("button.danger-button")
    .click();
  d = await read();
  assert.ok(
    !d.whatsapp.templates.some((t) => t.id === tpl.id),
    "template deleted",
  );

  // Rule add + delete
  await page.getByRole("button", { name: "Rules", exact: true }).click();
  await page.getByRole("button", { name: "New rule", exact: true }).click();
  await page.getByLabel(/Rule name/).fill("Lifecycle nudge");
  await page.getByLabel(/Offset/).fill("-2");
  await page.getByLabel(/Template/).selectOption("renewal_reminder");
  await page.getByRole("button", { name: "Save rule", exact: true }).click();
  await page
    .getByRole("button", { name: "Save rule", exact: true })
    .waitFor({ state: "hidden" });
  d = await read();
  const rule = d.whatsapp.rules.find((r) => r.name === "Lifecycle nudge");
  assert.ok(rule && rule.offsetDays === -2, "rule created");
  await page
    .locator(".list-item", { hasText: "Lifecycle nudge" })
    .locator("button.danger-button")
    .click();
  assert.ok(
    !(await read()).whatsapp.rules.some((r) => r.id === rule.id),
    "rule deleted",
  );

  // ---------------------------------------------------------------------------
  // 4. Staff lifecycle: add -> disable -> enable -> role update -> remove
  // ---------------------------------------------------------------------------
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("New staff email", { exact: true })
    .fill("reception2@demo.local");
  await page
    .getByLabel("New staff role", { exact: true })
    .selectOption("reception");
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  d = await read();
  let staff = d.staff.find((s) => s.email === "reception2@demo.local");
  assert.ok(
    staff && staff.role === "reception" && staff.enabled,
    "staff added",
  );

  const staffRow = () =>
    page.locator(".list-item", { hasText: "reception2@demo.local" });
  await staffRow()
    .getByRole("button", { name: "Disable", exact: true })
    .click();
  assert.equal(
    (await read()).staff.find((s) => s.id === staff.id).enabled,
    false,
  );
  await staffRow().getByRole("button", { name: "Enable", exact: true }).click();
  assert.equal(
    (await read()).staff.find((s) => s.id === staff.id).enabled,
    true,
  );
  await staffRow()
    .getByRole("combobox", { name: /Role for reception2@demo.local/ })
    .selectOption("owner");
  d = await read();
  assert.equal(d.staff.find((s) => s.id === staff.id).role, "owner");
  await staffRow().getByRole("button", { name: "Remove", exact: true }).click();
  assert.ok(
    !(await read()).staff.some((s) => s.id === staff.id),
    "staff removed",
  );

  // ---------------------------------------------------------------------------
  // 5. Audit trail reflects the lifecycles above
  // ---------------------------------------------------------------------------
  await page.getByRole("button", { name: "Audit", exact: true }).click();
  const rows = page.locator(".audit-row");
  assert.ok((await rows.count()) >= 5, "audit populated");
  const auditText = await page.locator("main").innerText();
  for (const label of [
    "Member saved",
    "Membership created",
    "Payment collected",
    "Check-in recorded",
    "Check-in corrected",
    "Contact logged",
    "Staff added",
    "WhatsApp settings changed",
  ]) {
    assert.ok(auditText.includes(label), `audit shows "${label}"`);
  }

  assert.deepEqual(errors, [], "no page errors");
  console.log(
    "PASS: soft-delete (archive/restore/hard delete), full member lifecycle " +
      "(membership, payment, attendance, follow-up, delete-with-history blocked), " +
      "WhatsApp UI lifecycle (setup/seed/queue/send/log/template+rule CRUD), " +
      "staff disable/enable/role/remove, and audit trail.",
  );
} finally {
  await page.screenshot({
    path: "artifacts/lifecycles/final.png",
    fullPage: true,
  });
  await browser.close();
}
