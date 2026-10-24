import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import {
  launch,
  open,
  signIn,
  connect,
  read,
  TEST_URL,
} from "./live-harness.mjs";
const client = await connect(),
  data = await read(client),
  member = data.members.find((m) => !m.archived);
assert(member, "A member is required for the read-only search measurement");
const browser = await launch();
try {
  const { page } = await open(browser);
  await page.route("**/rest/v1/rpc/gym_action", (r) => r.abort());
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
  await page.route("https://fonts.gstatic.com/**", (r) => r.abort());
  await page.goto(TEST_URL, { waitUntil: "domcontentloaded" });
  const metrics = {};
  async function measure(name, action, ready) {
    const start = await page.evaluate(() => performance.now());
    await action();
    await ready();
    const end = await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve(performance.now())),
          ),
        ),
    );
    metrics[name] = Math.round(end - start);
  }
  await measure(
    "loginToDashboardMs",
    () => signIn(page),
    () =>
      page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor(),
  );
  const dashboardNodes = await page.locator("*").count();
  const nav = (name) =>
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name, exact: true })
      .click();
  await measure(
    "membersNavigationMs",
    () => nav("Members"),
    () =>
      page
        .getByRole("heading", { name: "Members", exact: true, level: 1 })
        .waitFor(),
  );
  await measure(
    "memberSearchMs",
    () => page.getByLabel("Search name, phone or member ID").fill(member.name),
    () =>
      page
        .getByRole("button", { name: "Open " + member.name, exact: true })
        .first()
        .waitFor(),
  );
  await measure(
    "memberProfileMs",
    () =>
      page
        .getByRole("button", { name: "Open " + member.name, exact: true })
        .first()
        .click(),
    () =>
      page
        .getByRole("heading", { name: member.name, exact: true, level: 1 })
        .waitFor(),
  );
  await measure(
    "attendanceNavigationMs",
    () => nav("Attendance"),
    () =>
      page
        .getByRole("heading", { name: "Attendance", exact: true, level: 1 })
        .waitFor(),
  );
  await measure(
    "feesNavigationMs",
    () => nav("Fees & receipts"),
    () =>
      page
        .getByRole("heading", {
          name: "Fees & receipts",
          exact: true,
          level: 1,
        })
        .waitFor(),
  );
  const memory = await page.evaluate(() =>
    performance.memory
      ? { usedJSHeapBytes: performance.memory.usedJSHeapSize }
      : null,
  );
  const report = {
    metrics,
    dashboardNodes,
    memory,
    data: {
      members: data.members.length,
      payments: data.payments.length,
      visits: data.attendance.length,
    },
    notes:
      "Read-only, post-optimization local browser measurements. Includes Playwright interaction and paint waits; no before/after browser claim or production SLA. Chromium heap is an approximate single-process observation.",
  };
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/performance-browser.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
