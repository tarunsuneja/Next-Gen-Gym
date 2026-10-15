import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.GYMDESK_BROWSER_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.GYMDESK_TEST_URL || "http://127.0.0.1:5173/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await page
    .getByRole("heading", { name: "A good day starts here." })
    .waitFor();
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/dashboard-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await page.getByLabel("Full name").fill("Test Member");
  await page.getByLabel("Phone number", { exact: true }).fill("9876543210");
  await page.getByText("Additional details", { exact: false }).click();
  await page.getByLabel("Gender").selectOption("Female");
  await page.getByLabel("Address").fill("12 MG Road, Bengaluru");
  await page.getByLabel("Height (cm)").fill("165");
  await page.getByLabel("Weight (kg)").fill("61.5");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Members", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search name, phone or member ID" })
    .fill("Test Member");
  await page.getByRole("button", { name: "Test Member 9876543210" }).click();
  assert(await page.getByText("Female · 165 cm · 61.5 kg").isVisible());
  assert(await page.getByText("12 MG Road, Bengaluru").isVisible());
  await page
    .getByRole("button", { name: "Add membership", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Collect payment", exact: true })
    .click();
  await page.getByLabel("Amount (₹)").fill("500");
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Payment receipt", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert(
    await page.getByText("₹1,000 pending", { exact: true }).first().isVisible(),
  );
  await page
    .getByRole("button", { name: /View receipt DEMO-/ })
    .last()
    .click();
  assert(await page.getByText("₹500", { exact: true }).last().isVisible());
  await page.getByRole("button", { name: "Void payment", exact: true }).click();
  await page.getByLabel("Reason").fill("Test correction");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert(
    await page.getByText("₹1,500 pending", { exact: true }).first().isVisible(),
  );
  await page.getByRole("button", { name: "Attendance", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Find a member to check in" })
    .fill("Test Member");
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await page.locator(".table-scroll").getByRole("button", { name: "Check out", exact: true }).waitFor();
  assert(
    await page.locator(".table-scroll").getByRole("button", { name: "Check out", exact: true }).isEnabled(),
  );
  await page.reload();
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await page.getByRole("button", { name: "Members", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search name, phone or member ID" })
    .fill("Test Member");
  assert(
    await page
      .getByRole("button", { name: "Test Member 9876543210" })
      .isVisible(),
  );
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => document.querySelector(".sidebar").getBoundingClientRect().right <= 0,
  );
  await page.screenshot({
    path: "artifacts/dashboard-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Reminders", exact: true }).click();
  assert(
    await page
      .getByRole("heading", { name: "Reminders", exact: true })
      .isVisible(),
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS: member creation, renewal, partial payment, receipt, void, attendance deduplication, persistence, mobile navigation and no runtime errors.",
  );
} finally {
  await browser.close();
}
