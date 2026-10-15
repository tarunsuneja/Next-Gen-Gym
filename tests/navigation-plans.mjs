import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.GYMDESK_BROWSER_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
try {
  await page.goto(process.env.GYMDESK_TEST_URL || "http://127.0.0.1:5173/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  assert.equal(
    await page
      .locator(".sidebar")
      .evaluate((el) => Math.round(el.getBoundingClientRect().width)),
    80,
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: /^Modify .* plan$/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Plan name").fill("Professional monthly");
  await dialog.getByLabel("Calendar months").fill("2");
  await dialog.getByLabel("Price (₹)").fill("2199");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert(
    await page.getByText("Professional monthly", { exact: true }).isVisible(),
  );
  await page.reload();
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  assert(
    await page
      .getByRole("button", { name: "Expand sidebar", exact: true })
      .isVisible(),
  );
  await page
    .getByRole("button", { name: "View check-ins", exact: true })
    .click();
  assert(
    await page
      .getByRole("heading", { name: "Attendance", exact: true })
      .isVisible(),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  assert(
    await page.getByText("Professional monthly", { exact: true }).isVisible(),
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  console.log(
    "Sidebar persistence, plan editing, dashboard tasks and mobile navigation passed.",
  );
} finally {
  await browser.close();
}
