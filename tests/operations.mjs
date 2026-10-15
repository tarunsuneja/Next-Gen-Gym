import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.GYMDESK_BROWSER_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
try {
  await page.goto(process.env.GYMDESK_TEST_URL || "http://127.0.0.1:5173/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  assert.equal(
    await page.getByLabel("Search workspace", { exact: true }).count(),
    0,
  );
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Search workspace", { exact: true }).fill("Reports");
  await page.locator(".finder-results button").first().click();
  assert(
    await page
      .getByRole("heading", { name: "Reports", exact: true })
      .isVisible(),
  );
  await page
    .getByRole("button", { name: "Open global search", exact: true })
    .click();
  await page.getByLabel("Search workspace", { exact: true }).fill("DEMO-0001");
  await page.locator(".finder-results button").first().click();
  assert(
    await page
      .getByRole("heading", { name: "Payment receipt", exact: true })
      .isVisible(),
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page
    .getByRole("button", { name: "View pending fees", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Member status filter").inputValue(),
    "Pending fees",
  );
  await page
    .getByRole("button", { name: "Open global search", exact: true })
    .click();
  await page.getByLabel("Search workspace", { exact: true }).fill("Arjun");
  await page.locator(".finder-results button").first().click();
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gymdesk-demo-v1")),
  );
  const membership = before.memberships.find(
    (s) =>
      s.memberId === before.members.find((m) => m.name === "Arjun Mehta").id,
  );
  await page
    .getByRole("button", { name: "Edit membership", exact: true })
    .click();
  const edit = page.getByRole("dialog");
  await edit
    .getByLabel("Payment due date", { exact: true })
    .fill("2026-01-01");
  await edit
    .getByLabel("Reason for change", { exact: true })
    .fill("Correcting the payment due date");
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await edit.waitFor({ state: "hidden" });
  let after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gymdesk-demo-v1")),
  );
  assert.equal(
    after.memberships.find((s) => s.id === membership.id).dueDate,
    "2026-01-01",
    "membership edit updates the due date",
  );
  assert.notEqual(
    after.memberships.find((s) => s.id === membership.id).amount,
    undefined,
    "membership amount stays defined after edit",
  );
  await page
    .getByRole("button", { name: "Cancel membership", exact: true })
    .click();
  await page.getByLabel("Reason", { exact: true }).fill("Member is relocating");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gymdesk-demo-v1")),
  );
  const cancelled = after.memberships.find((s) => s.id === membership.id);
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.amount, membership.amount);
  assert.equal(cancelled.dueDate, "2026-01-01");
  await page
    .getByRole("button", { name: "Log follow-up", exact: true })
    .click();
  await page
    .getByLabel("Contact notes", { exact: true })
    .fill("Will discuss new membership tomorrow");
  await page.getByLabel("Next follow-up date (optional)", { exact: true }).fill(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Follow-ups", exact: true }).click();
  assert(
    await page
      .locator(".attention-row")
      .filter({ hasText: "Arjun Mehta" })
      .isVisible(),
  );
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  assert(
    await page
      .getByRole("heading", { name: "Payment methods", exact: true })
      .isVisible(),
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export collections", exact: true })
    .click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^collections-/);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  console.log(
    "PASS: actionable cards, search, membership edit, cancellation preservation, follow-up queue and report export.",
  );
} finally {
  await browser.close();
}
