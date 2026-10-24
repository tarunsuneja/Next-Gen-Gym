import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { launch, open, signIn } from "./live-harness.mjs";

mkdirSync("tests/artifacts", { recursive: true });

const browser = await launch();
try {
  const { page } = await open(browser);

  await page.goto("http://127.0.0.1:5173/", {
    waitUntil: "networkidle",
  });

  const signin = await page.evaluate(() => performance.now());
  await signIn(page);
  const afterLogin = await page.evaluate(() => performance.now());
  const loginMs = afterLogin - signin;

  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  const afterDash = await page.evaluate(() => performance.now());
  const dashMs = afterDash - signin;

  // Members
  await page
    .getByLabel("Main navigation")
    .getByRole("button", { name: "Members" })
    .click();
  await page.getByRole("heading", { name: "Members" }).waitFor();
  const tMembers = await page.evaluate(() => performance.now());
  const membersMs = tMembers - afterDash;

  // Search
  await page.getByLabel("Search name, phone or member ID").fill("Jatin 119");
  await page.getByLabel("Open Jatin 119").waitFor();
  const tSearch = await page.evaluate(() => performance.now());
  const searchMs = tSearch - tMembers;

  // Open detail
  await page.getByLabel("Open Jatin 119").click();
  await page.getByRole("heading", { level: 1, name: "Jatin 119" }).waitFor();
  const tDetail = await page.evaluate(() => performance.now());
  const detailMs = tDetail - tSearch;
  await page.getByRole("button", { name: /Back to Members/ }).click();

  // Attendance
  await page
    .getByLabel("Main navigation")
    .getByRole("button", { name: "Attendance" })
    .click();
  await page.getByRole("heading", { name: "Attendance" }).waitFor();
  const tAtt = await page.evaluate(() => performance.now());
  const attMs = tAtt - tDetail;

  // Payments/Fees
  await page
    .getByLabel("Main navigation")
    .getByRole("button", { name: "Fees & receipts" })
    .click();
  await page.getByRole("heading", { name: "Fees & receipts" }).waitFor();
  const tPay = await page.evaluate(() => performance.now());
  const payMs = tPay - tAtt;

  const metrics = {
    loginMs: Math.round(loginMs),
    dashboardMs: Math.round(dashMs),
    membersMs: Math.round(membersMs),
    searchMs: Math.round(searchMs),
    memberDetailMs: Math.round(detailMs),
    attendanceMs: Math.round(attMs),
    feesReceiptsMs: Math.round(payMs),
  };
  console.table(metrics);
  await page.screenshot({ path: "tests/artifacts/perf-timings.png" });
} finally {
  await browser.close();
}
