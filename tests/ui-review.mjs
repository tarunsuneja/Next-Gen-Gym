import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.GYMDESK_BROWSER_PATH || undefined,
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  colorScheme: "light",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const pages = [
  "Dashboard",
  "Members",
  "Fees & receipts",
  "Attendance",
  "Reminders",
  "Messages",
  "Settings",
  "Reports",
  "Audit",
];
const navigate = async (name, mobile) => {
  if (mobile)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name, exact: true }).click();
};
try {
  await mkdir("artifacts/review", { recursive: true });
  await page.goto(process.env.GYMDESK_TEST_URL || "http://127.0.0.1:5173/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  for (const theme of ["light", "dark"]) {
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      await page
        .getByRole("button", { name: "Switch to " + theme + " theme" })
        .click();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
      if (width === 390)
        await page.waitForFunction(
          () =>
            document.querySelector(".sidebar").getBoundingClientRect().right <=
            0,
        );
      for (const name of pages) {
        await navigate(name, width === 390);
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          name + " overflows at " + width,
        );
        await page.screenshot({
          path:
            "artifacts/review/" +
            theme +
            "-" +
            width +
            "-" +
            name.replaceAll(" ", "-").replaceAll("&", "and") +
            ".png",
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  }
  // A global collection must never silently choose a person.
  await page.setViewportSize({ width: 1440, height: 1050 });
  await navigate("Fees & receipts", false);
  await page
    .getByRole("button", { name: "Collect payment", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Outstanding membership").inputValue(),
    "",
  );
  assert(await page.getByLabel("Amount (₹)").isDisabled());
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  assert(await page.getByRole("dialog").isVisible());
  await page.getByLabel("Outstanding membership").selectOption({ index: 1 });
  assert(await page.getByLabel("Amount (₹)").isEnabled());
  assert(
    await page.getByText("Balance after payment", { exact: true }).isVisible(),
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  // Dataset large enough to exercise pagination, in a disposable isolated test context.
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("gymdesk-demo-v1") || "null");
    if (!d) return;
    for (let i = 0; i < 15; i++)
      d.members.push({
        ...d.members[0],
        id: "fixture-" + i,
        name: "Z Pagination " + i,
        phone: "99900000" + String(i).padStart(2, "0"),
      });
    localStorage.setItem("gymdesk-demo-v1", JSON.stringify(d));
  });
  // Persist seed first if the untouched demo has not been written yet.
  await navigate("Settings", false);
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("gymdesk-demo-v1"));
    if (!d.members.some((m) => m.id === "fixture-0")) {
      for (let i = 0; i < 15; i++)
        d.members.push({
          ...d.members[0],
          id: "fixture-" + i,
          name: "Z Pagination " + i,
          phone: "99900000" + String(i).padStart(2, "0"),
        });
      localStorage.setItem("gymdesk-demo-v1", JSON.stringify(d));
    }
  });
  await page.reload();
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await navigate("Members", false);
  await page.getByRole("button", { name: "Next members page" }).click();
  assert(await page.getByText("Page 2 / 3", { exact: true }).isVisible());
  await page
    .getByRole("textbox", { name: "Search name, phone or member ID" })
    .fill("Arjun");
  assert(
    await page
      .getByRole("button", { name: "Open Arjun Mehta", exact: true })
      .isVisible(),
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS: all 9 screens in light/dark at desktop/mobile, no overflow/runtime errors, explicit payment selection, balance preview, pagination and search reset.",
  );
} finally {
  await browser.close();
}
