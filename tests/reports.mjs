import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  executablePath: process.env.GYMDESK_BROWSER_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const card = (n) => page.locator(".report-metrics .stat").nth(n);
const panel = (heading) =>
  page
    .locator(".panel")
    .filter({ has: page.getByRole("heading", { name: heading, exact: true }) });
const exportIn = (heading) =>
  panel(heading).getByRole("button", { name: "Export", exact: true }).first();

try {
  await page.goto(process.env.GYMDESK_TEST_URL || "http://127.0.0.1:5173/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await page.getByRole("heading", { name: "Reports", exact: true }).waitFor();

  // Range presets + default
  assert.equal(await page.getByRole("tab").count(), 6, "six report ranges");
  assert.equal(
    await page
      .getByRole("tab", { name: "This month" })
      .getAttribute("aria-selected"),
    "true",
    "month is the default range",
  );
  assert.ok(
    (await page.locator(".report-metrics .stat-trend").count()) >= 4,
    "trend pills on the trend KPIs",
  );

  // Payment methods contract (used by other suites) still present
  assert(
    await page
      .getByRole("heading", { name: "Payment methods", exact: true })
      .isVisible(),
  );

  // Collections where data exists, and revenue-by-plan grouping
  assert.ok(
    parseFloat(
      (await card(0).locator("strong").innerText()).replace(/[^0-9.]/g, ""),
    ) > 0,
    "collections in this month",
  );
  assert(
    await page
      .getByRole("heading", { name: "Collections by plan", exact: true })
      .isVisible(),
  );
  assert.ok(
    (await page.locator(".plan-row").count()) >= 2,
    "plan rows grouped",
  );
  assert(
    await page.locator(".plan-row", { hasText: "Monthly" }).first().isVisible(),
    "Monthly plan row",
  );
  assert(
    await page
      .locator(".plan-row", { hasText: "Quarterly" })
      .first()
      .isVisible(),
    "Quarterly plan row",
  );

  // New-member trend responds to the range: 0 recent vs 8 over 90 days
  await page.getByRole("tab", { name: "Last 30 days" }).click();
  assert.equal((await card(1).locator("strong").innerText()).trim(), "0");
  await page.getByRole("tab", { name: "Last 90 days" }).click();
  assert.equal((await card(1).locator("strong").innerText()).trim(), "8");
  assert(
    (await panel("New members").locator(".list-item").count()) >= 8,
    "new members listed",
  );

  // Custom range reveals inputs and flags an empty/invalid range
  await page.getByRole("tab", { name: "Custom" }).click();
  await page.getByLabel("From", { exact: true }).waitFor();
  await page.getByLabel("From", { exact: true }).fill("");
  assert(await page.getByRole("alert").isVisible(), "invalid range flagged");
  await page.getByLabel("From", { exact: true }).fill("2026-01-01");
  await page.getByRole("alert").waitFor({ state: "hidden" });

  // Exports carry the expected filenames
  for (const [heading, pattern] of [
    ["Collections by plan", /^revenue-by-plan-/],
    ["Attendance", /^attendance-/],
    ["Retention & lapsed", /^lapsed-members-/],
    ["New members", /^new-members-/],
  ]) {
    const dl = page.waitForEvent("download");
    await exportIn(heading).click();
    assert.match((await dl).suggestedFilename(), pattern, heading + " export");
  }
  const collections = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export collections", exact: true })
    .click();
  assert.match((await collections).suggestedFilename(), /^collections-/);
  const outstanding = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export", exact: true })
    .last()
    .click();
  assert.equal(
    (await outstanding).suggestedFilename(),
    "outstanding-balances.csv",
  );

  // Print action is available (not invoked to avoid a native dialog)
  assert(
    await page
      .getByRole("button", { name: "Print / PDF", exact: true })
      .isVisible(),
  );

  // No horizontal overflow on desktop or phone
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "reports fit desktop",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "reports fit phone",
  );

  assert.deepEqual(errors, [], "no page errors");
  console.log(
    "PASS: report ranges, trend KPIs, revenue-by-plan, retention/lapsed, " +
      "new-member and attendance analytics, CSV exports and print, responsive.",
  );
} finally {
  await browser.close();
}
