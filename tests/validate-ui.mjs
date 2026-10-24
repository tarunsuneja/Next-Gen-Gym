import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { launch, open, signIn } from "./live-harness.mjs";

const pages = [
  "Dashboard",
  "Members",
  "Fees & receipts",
  "Attendance",
  "Reminders",
  "Settings",
  "Reports",
  "Audit",
];

let passed = 0;
const failures = [];
async function check(label, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${label}`);
  } catch (err) {
    failures.push(`${label} :: ${err.message}`);
    console.log(`  FAIL  ${label} -> ${err.message}`);
  }
}

mkdirSync("tests/artifacts", { recursive: true });

const browser = await launch();
try {
  const { page, errors } = await open(browser);
  await signIn(page);

  console.log("\n== UI: sign-in and dashboard ==");

  await check("dashboard renders with live data", async () => {
    await page.getByRole("heading", { level: 1, name: "Dashboard" }).waitFor();
    await page.screenshot({ path: "tests/artifacts/ui-dashboard.png" });
  });

  await check("dashboard shows member and collection stats", async () => {
    const body = await page.locator("body").innerText();
    assert.match(body, /members/i);
    assert.match(body, /₹|collections|revenue|balance/i);
  });

  console.log("\n== UI: members list, search, detail ==");

  await page
    .getByLabel("Main navigation")
    .getByRole("button", { name: "Members" })
    .click();

  await check("members page renders", async () => {
    await page.getByRole("heading", { level: 1, name: "Members" }).waitFor();
    await page.screenshot({ path: "tests/artifacts/ui-members.png" });
  });

  await check("search narrows to a seeded member", async () => {
    const search = page.getByLabel("Search name, phone or member ID");
    await search.fill("Jatin 119");
    await page.getByLabel("Open Jatin 119").waitFor({ timeout: 5000 });
    await page.screenshot({ path: "tests/artifacts/ui-members-search.png" });
  });

  await check("member detail opens", async () => {
    await page.getByLabel("Open Jatin 119").click();
    await page.getByRole("heading", { level: 2, name: "Jatin 119" }).waitFor();
    await page.screenshot({ path: "tests/artifacts/ui-member-detail.png" });
    await page.getByRole("button", { name: /Back to Members/ }).click();
    await page.getByRole("heading", { level: 1, name: "Members" }).waitFor();
    await page.getByLabel("Search name, phone or member ID").fill("");
  });

  console.log("\n== UI: every navigation screen renders ==");

  for (const name of pages) {
    await check(`${name} screen renders`, async () => {
      const heading = name === "Dashboard" ? "Dashboard" : name;
      await page
        .getByLabel("Main navigation")
        .getByRole("button", { name })
        .click();
      await page
        .getByRole("heading", { level: 1, name: heading, exact: true })
        .waitFor({ timeout: 5000 });
      await page.screenshot({
        path: `tests/artifacts/ui-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`,
      });
    });
  }

  console.log("\n== UI: global search and modals ==");

  await check("global search finds a member", async () => {
    await page.getByLabel("Open global search").click();
    await page.getByRole("heading", { name: "Global search" }).waitFor();
    const box = page.locator(".global-search-content input").first();
    await box.fill("Jatin");
    await page.getByText("Jatin 119").first().waitFor({ timeout: 5000 });
    await page.keyboard.press("Escape");
  });

  await check("add member modal opens", async () => {
    await page
      .getByLabel("Main navigation")
      .getByRole("button", { name: "Members" })
      .click();
    await page.getByRole("button", { name: "Add member", exact: true }).click();
    await page.getByRole("heading", { name: "Add a member" }).waitFor();
    await page.keyboard.press("Escape");
  });

  console.log("\n== UI: staff sees fewer options than admin ==");

  await check("no uncaught page errors during admin session", async () => {
    assert.deepEqual(errors, []);
  });

  await check(
    "reception session hides Audit and Admin-only controls",
    async () => {
      await page.getByRole("button", { name: "Sign out" }).click();
      await page.getByRole("button", { name: "Sign in" }).waitFor();
      await page.getByLabel("Email address").fill("staff@gym.local");
      await page.getByLabel("Password").fill("password123");
      await page.getByRole("button", { name: "Sign in" }).click();
      await page
        .getByRole("heading", { level: 1, name: "Dashboard" })
        .waitFor();
      const nav = page.getByLabel("Main navigation");
      assert.equal(await nav.getByRole("button", { name: "Audit" }).count(), 0);
      await page
        .getByLabel("Main navigation")
        .getByRole("button", { name: "Settings" })
        .click();
      await page.getByRole("heading", { level: 1, name: "Settings" }).waitFor();
      await page.screenshot({ path: "tests/artifacts/ui-staff-settings.png" });
    },
  );

  await check("no uncaught page errors during staff session", async () => {
    assert.deepEqual(errors, []);
  });

  await browser.close();
} catch (err) {
  await browser.close();
  throw err;
}

console.log("\n================ UI SUMMARY ================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failures.length}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("ALL UI SCENARIOS PASSED");
