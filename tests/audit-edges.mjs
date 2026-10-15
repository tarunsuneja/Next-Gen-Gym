import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.GYMDESK_BROWSER_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const read = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("gymdesk-demo-v1")));
const go = async (name) => {
  if (page.viewportSize().width < 721)
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await page.getByRole("button", { name, exact: true }).click();
};
try {
  await page.goto(process.env.GYMDESK_TEST_URL || "http://localhost:5173");
  await page
    .getByRole("button", { name: "Explore demo workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "7 days", exact: true }).click();
  await page
    .getByRole("button", { name: "View collections", exact: true })
    .click();
  assert(
    await page
      .getByRole("button", { name: "Clear date filter", exact: true })
      .isVisible(),
  );
  assert.equal(
    await page.locator("table").first().locator("tbody tr").count(),
    7,
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await pending,
    stream = await (await download).createReadStream();
  let csv = "";
  for await (const chunk of stream) csv += chunk.toString();
  assert.equal(csv.trim().split(/\r?\n/).length, 8);
  await go("Dashboard");
  await page
    .getByRole("button", { name: "View new members", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Member status filter").inputValue(),
    "Joined in range",
  );
  assert.equal(await page.locator("table tbody tr").count(), 0);
  await go("Settings");
  await page
    .getByLabel("New staff email", { exact: true })
    .fill("reception@demo.local");
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "already a staff member" })
    .waitFor();
  assert.equal(
    await page.getByLabel("New staff email", { exact: true }).inputValue(),
    "reception@demo.local",
  );
  await go("Messages");
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page.getByRole("button", { name: "New template", exact: true }).click();
  await page.locator('input[name="name"]').fill("audit_dependency");
  await page
    .getByLabel("Message body")
    .fill("{{gym_name}} greets {{member_name}} from {{gym_name}}");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .waitFor({ state: "hidden" });
  let d = await read();
  const template = d.whatsapp.templates.find(
    (t) => t.name === "audit_dependency",
  );
  assert.deepEqual(template.variables, ["gym_name", "member_name", "gym_name"]);
  await page.getByRole("button", { name: "Rules", exact: true }).click();
  await page.getByRole("button", { name: "New rule", exact: true }).click();
  await page.getByLabel("Rule name").fill("Audit dependency rule");
  await page
    .locator('select[name="templateName"]')
    .selectOption("audit_dependency");
  await page.getByRole("button", { name: "Save rule", exact: true }).click();
  await page
    .getByRole("button", { name: "Save rule", exact: true })
    .waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page
    .locator(".list-item", { hasText: "audit_dependency" })
    .locator("button.danger-button")
    .click();
  await page.getByRole("alert").filter({ hasText: "reassign rules" }).waitFor();
  assert((await read()).whatsapp.templates.some((t) => t.id === template.id));
  await page
    .locator(".list-item", { hasText: "audit_dependency" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.locator('input[name="name"]').fill("audit_renamed");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    (await read()).whatsapp.rules.find(
      (r) => r.name === "Audit dependency rule",
    ).templateName,
    "audit_renamed",
  );
  // Disposable context only: verify every page with zero business records.
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("gymdesk-demo-v1"));
    for (const key of [
      "members",
      "memberships",
      "plans",
      "payments",
      "attendance",
      "reminders",
      "audit",
    ])
      d[key] = [];
    d.whatsapp.templates = [];
    d.whatsapp.rules = [];
    d.whatsapp.messages = [];
    localStorage.setItem("gymdesk-demo-v1", JSON.stringify(d));
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Explore demo workspace", exact: true })
    .click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
    for (const name of [
      "Dashboard",
      "Members",
      "Fees & receipts",
      "Attendance",
      "Reminders",
      "Messages",
      "Reports",
      "Settings",
      "Audit",
    ]) {
      await go(name);
      assert(
        await page
          .getByRole("heading", {
            name: name === "Dashboard" ? "A good day starts here." : name,
            exact: true,
          })
          .isVisible(),
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `empty ${name} overflows at ${width}`,
      );
      assert(
        !/NaN|Infinity/.test(await page.locator("main").innerText()),
        `invalid numbers on ${name}`,
      );
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: scoped dashboard drill-downs/exports, failed staff saves, template dependencies/parameter order, all nine empty pages on desktop and phone.",
  );
} finally {
  await browser.close();
}
