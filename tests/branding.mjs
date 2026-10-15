import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.GYMDESK_BROWSER_PATH || undefined,
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  colorScheme: "light",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.GYMDESK_TEST_URL || "http://127.0.0.1:5173/");
  assert.equal(await page.title(), "The Next Generation Fitness Gym");
  assert(
    await page
      .getByRole("img", { name: "Next Generation Fitness logo" })
      .first()
      .evaluate((img) => img.complete && img.naturalWidth > 0),
  );
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.reload();
  await page.getByRole("button", { name: "Switch to light theme" }).waitFor();
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  assert(
    await page
      .getByText("The Next Generation Fitness Gym", { exact: true })
      .first()
      .isVisible(),
  );
  await page.screenshot({
    path: "artifacts/ngf-dark-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  assert.equal(
    await page
      .getByRole("dialog")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(33, 31, 36)",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page.screenshot({
    path: "artifacts/ngf-light-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => document.querySelector(".sidebar").getBoundingClientRect().right <= 0,
  );
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "artifacts/ngf-dark-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Open navigation" }).click();
  assert(
    await page
      .getByRole("img", { name: "Next Generation Fitness logo" })
      .isVisible(),
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS: gym branding, logo loading, theme switching and persistence, dark forms, mobile layout and navigation.",
  );
} finally {
  await browser.close();
}
