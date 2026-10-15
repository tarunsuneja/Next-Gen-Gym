import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({
  executablePath: process.env.GYMDESK_BROWSER_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const money = (t) => parseFloat((t || "").replace(/[^0-9.]/g, "")) || 0;

try {
  await mkdir("artifacts/dashboard", { recursive: true });
  await page.goto(process.env.GYMDESK_TEST_URL || "http://127.0.0.1:5173/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();

  const cols = () => page.locator(".collection-panel .bar-column");
  const badge = () => page.locator(".collection-panel .panel-header .badge");
  const collectionsValue = () =>
    page.locator('button[aria-label="View collections"] strong').innerText();

  // Range selector present, defaults to 7 days
  const tabs = page.locator(".range-tabs button");
  assert.equal(await tabs.count(), 4, "four range options");
  await page.getByRole("button", { name: "7 days", exact: true }).waitFor();
  assert.equal(await cols().count(), 7, "7-day chart has 7 columns");
  assert.ok(
    (await page.locator(".stat-trend").count()) >= 3,
    "trend badges rendered on range KPIs",
  );
  const week = money(await collectionsValue());

  // Today -> hourly dense chart
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.locator(".collection-panel .bar-chart.dense").waitFor();
  assert.equal(await cols().count(), 24, "today chart covers all 24 hours");
  assert.equal((await badge().innerText()).trim(), "Today by hour");
  await page.getByText("Check-ins today", { exact: true }).waitFor();
  const today = money(await collectionsValue());
  assert.ok(today <= week, "today's collections <= 7-day collections");

  // 30 days -> dense daily chart
  await page.getByRole("button", { name: "30 days", exact: true }).click();
  assert.equal(await cols().count(), 30, "30-day chart has 30 columns");
  assert.equal((await badge().innerText()).trim(), "Last 30 days");
  const month30 = money(await collectionsValue());
  assert.ok(month30 >= week, "30-day collections >= 7-day collections");

  // This month -> month-to-date buckets
  await page.getByRole("button", { name: "This month", exact: true }).click();
  const mCount = await cols().count();
  assert.ok(mCount >= 1 && mCount <= 31, "month chart bucket count in range");
  assert.equal((await badge().innerText()).trim(), "Month to date");

  await page.screenshot({
    path: "artifacts/dashboard/dashboard-month.png",
    fullPage: true,
  });

  // No horizontal overflow on a phone viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "7 days", exact: true }).click();
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  assert.ok(overflow, "dashboard does not overflow on mobile");
  await page.screenshot({
    path: "artifacts/dashboard/dashboard-mobile.png",
    fullPage: true,
  });

  assert.deepEqual(errors, [], "no page errors");
  console.log(
    "PASS: dashboard time ranges (Today/7/30/month), trend deltas, " +
      "hourly + daily collection chart, and mobile overflow.",
  );
} finally {
  await browser.close();
}
