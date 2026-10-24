import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launch, signIn, TEST_URL } from "./live-harness.mjs";
const browser = await launch();
try {
  await mkdir("tests/artifacts/history", { recursive: true });
  for (const role of ["owner", "staff"])
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
          viewport: { width, height: 1000 },
        }),
        page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/rest/v1/rpc/gym_action", (r) => r.abort());
      await page.route("**/api/whatsapp/**", (r) => r.abort());
      await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
      await page.goto(TEST_URL, { waitUntil: "domcontentloaded" });
      await signIn(page, role + "@gym.local", "password123");
      await page
        .getByRole("heading", { name: "Dashboard", exact: true })
        .waitFor();
      async function nav(name) {
        if (width < 900)
          await page
            .getByRole("button", { name: "Open navigation", exact: true })
            .click();
        await page
          .getByRole("navigation", { name: "Main navigation" })
          .getByRole("button", { name, exact: true })
          .click();
      }
      await nav("Fees & receipts");
      await page.getByText("Page 1 · 10 payments", { exact: true }).waitFor();
      assert.equal(
        await page.getByRole("button", { name: /^View receipt / }).count(),
        10,
      );
      await page
        .getByRole("button", { name: "Next payments page", exact: true })
        .click();
      await page.getByText("Page 2 · 10 payments", { exact: true }).waitFor();
      assert.equal(
        await page.getByRole("button", { name: /^View receipt / }).count(),
        10,
      );
      await page.screenshot({
        path: `tests/artifacts/history/payments-${role}-${width}.png`,
        animations: "disabled",
      });
      if (role === "owner") {
        await nav("Audit");
        await page
          .getByText("Page 1 · 10 audit records", { exact: true })
          .waitFor();
        assert.equal(await page.locator(".audit-row").count(), 10);
        await page
          .getByRole("button", { name: "Next audit records page", exact: true })
          .click();
        await page
          .getByText("Page 2 · 10 audit records", { exact: true })
          .waitFor();
      }
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      assert.deepEqual(errors, []);
      await context.close();
    }
  console.log(
    "PASS: compiled production history paging against actual local data; admin/staff, desktop/mobile, no writes.",
  );
} finally {
  await browser.close();
}
