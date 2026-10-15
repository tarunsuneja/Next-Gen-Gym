import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.GYMDESK_BROWSER_PATH || undefined,
});
await mkdir("artifacts/workflows", { recursive: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 1050 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.goto(process.env.GYMDESK_TEST_URL || "http://127.0.0.1:5173/");
    await page.getByRole("button", { name: "Explore demo workspace" }).click();
    const read = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("gymdesk-demo-v1")));
    await page.getByRole("button", { name: "Add member", exact: true }).click();
    await page.screenshot({
      path: `artifacts/workflows/add-member-${width}.png`,
    });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    assert.equal(
      await page
        .getByLabel("Full name", { exact: true })
        .getAttribute("aria-invalid"),
      "true",
    );
    assert.equal((await read()).members.length, 8);
    await page
      .getByLabel("Full name", { exact: true })
      .fill("  Modern Member  ");
    await page
      .getByLabel("Phone number", { exact: true })
      .fill("+91 9000000010");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    assert(
      await page
        .locator(".form-error-summary")
        .getByText(/phone belongs/)
        .isVisible(),
    );
    await page
      .getByLabel("Phone number", { exact: true })
      .fill("+91 98765 43210");
    await page.getByLabel("Email", { exact: false }).fill("broken");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    assert.equal(
      await page
        .getByLabel("Email", { exact: false })
        .getAttribute("aria-invalid"),
      "true",
    );
    await page.getByLabel("Email", { exact: false }).fill("member@example.in");
    await page.getByText("Additional details", { exact: false }).click();
    await page.getByLabel("Gender").selectOption("Female");
    await page.getByLabel("Height (cm)", { exact: true }).fill("40");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    assert.equal(
      await page
        .getByLabel("Height (cm)", { exact: true })
        .getAttribute("aria-invalid"),
      "true",
    );
    await page.getByLabel("Height (cm)", { exact: true }).fill("172.5");
    await page.getByLabel("Weight (kg)", { exact: true }).fill("68.5");
    await page.getByLabel("Address", { exact: false }).fill("12 MG Road");
    await page.getByLabel("Notes", { exact: false }).fill("Evening member");
    // Two submit events in one task must not produce two member records.
    await page.locator("form").evaluate((form) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    let d = await read();
    assert.equal(d.members.length, 9);
    const member = d.members.find((m) => m.name === "Modern Member");
    assert.equal(member.phone, "9876543210");
    await page
      .getByRole("button", { name: "Edit member", exact: true })
      .click();
    await page.getByLabel("Full name", { exact: true }).fill("Updated Member");
    await page.getByLabel("Email", { exact: false }).fill("");
    await page.getByLabel("Address", { exact: false }).fill("24 Park Street");
    await page.getByLabel("Height (cm)", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    d = await read();
    assert.equal(d.members.length, 9);
    assert.equal(d.members.find((m) => m.id === member.id).email, "");
    assert.equal(d.members.find((m) => m.id === member.id).height, "");
    await page
      .getByRole("button", { name: "Add membership", exact: true })
      .click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Collect payment", exact: true })
      .click();
    await page.getByLabel("Amount (₹)", { exact: true }).fill("0");
    await page
      .getByRole("button", { name: "Record payment", exact: true })
      .click();
    assert(await page.locator(".form-error-summary").isVisible());
    await page.getByLabel("Amount (₹)", { exact: true }).fill("1501");
    await page
      .getByRole("button", { name: "Record payment", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("Amount (₹)", { exact: true })
        .getAttribute("aria-invalid"),
      "true",
    );
    await page.getByLabel("Amount (₹)", { exact: true }).fill("500");
    await page
      .getByLabel("Payment method", { exact: false })
      .selectOption("UPI");
    await page
      .getByLabel("Transaction reference", { exact: false })
      .fill("UPI-TEST-001");
    await page.screenshot({
      path: `artifacts/workflows/collect-payment-${width}.png`,
    });
    await page
      .getByRole("button", { name: "Record payment", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Payment receipt", exact: true })
      .waitFor();
    d = await read();
    const partial = d.payments.find((p) => p.memberId === member.id);
    assert.equal(partial.amount, 50000);
    assert.equal(partial.method, "UPI");
    assert.equal(partial.memberName, "Updated Member");
    assert.equal(partial.reference, "UPI-TEST-001");
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    assert(
      await page
        .getByText("₹1,000 pending", { exact: true })
        .first()
        .isVisible(),
    );
    await page
      .getByRole("button", { name: "Collect payment", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Use full outstanding amount", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Amount (₹)", { exact: true }).inputValue(),
      "1000",
    );
    await page
      .getByRole("button", { name: "Record payment", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Payment receipt", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    assert(
      await page
        .getByRole("button", { name: "Collect payment", exact: true })
        .isDisabled(),
    );
    assert.equal(
      (await read()).payments.filter((p) => p.memberId === member.id).length,
      2,
    );
    const replay = await page.evaluate(async () => {
      const { demoAction } = await import("/src/api.ts");
      const data = JSON.parse(localStorage.getItem("gymdesk-demo-v1"));
      const [requestId, request] = Object.entries(data.requests)
        .filter(([, r]) => r.type === "payment")
        .at(-1);
      const payload = JSON.parse(request.payload);
      const again = demoAction(data, { type: "payment", payload, requestId });
      let rejected = false;
      try {
        demoAction(again, {
          type: "payment",
          payload: { ...payload, amount: 1 },
          requestId,
        });
      } catch {
        rejected = true;
      }
      return { same: again.payments.length === data.payments.length, rejected };
    });
    assert(replay.same && replay.rejected);
    await page
      .getByRole("button", { name: "Open global search", exact: true })
      .click();
    await page.getByLabel("Search workspace", { exact: true }).fill("Fees");
    await page.locator(".finder-results button").first().click();
    for (const [name, method, amount] of [
      ["Rohan", "Card", "10.10"],
      ["Ananya", "Bank transfer", "10.25"],
    ]) {
      await page
        .getByRole("button", { name: "Collect payment", exact: true })
        .click();
      await page
        .getByLabel("Find outstanding member", { exact: true })
        .fill(name);
      await page
        .getByLabel("Outstanding membership")
        .selectOption({ index: 1 });
      await page.getByLabel("Amount (₹)", { exact: true }).fill(amount);
      assert.equal(
        await page.getByLabel("Amount (₹)", { exact: true }).inputValue(),
        amount,
      );
      await page.getByLabel("Payment method").selectOption(method);
      await page
        .getByRole("button", { name: "Record payment", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Payment receipt", exact: true })
        .waitFor();
      const payment = (await read()).payments.at(-1);
      assert.equal(payment.method, method);
      assert.equal(payment.amount, Math.round(Number(amount) * 100));
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
    }
    if (width === 1440) {
      // Staff administration: add, then remove (confirm dialog auto-accepted).
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page
        .getByLabel("New staff email", { exact: true })
        .fill("coach@example.in");
      await page
        .getByLabel("New staff role", { exact: true })
        .selectOption("reception");
      await page
        .getByRole("button", { name: "Add staff", exact: true })
        .click();
      await page.getByText("coach@example.in", { exact: true }).waitFor();
      assert.equal((await read()).staff.length, 3);
      await page
        .locator(".list-item", { hasText: "coach@example.in" })
        .getByRole("button", { name: "Remove", exact: true })
        .click();
      await page
        .getByText("coach@example.in", { exact: true })
        .waitFor({ state: "detached" });
      assert.equal((await read()).staff.length, 2);
      // Plan deletion leaves existing memberships untouched.
      let plans = (await read()).plans;
      const planName = plans.at(-1).name;
      await page
        .getByRole("button", { name: `Delete ${planName} plan`, exact: true })
        .click();
      await page.waitForFunction(
        (n) =>
          JSON.parse(localStorage.getItem("gymdesk-demo-v1")).plans.length === n,
        plans.length - 1,
      );
      assert.equal((await read()).plans.length, plans.length - 1);
      // A member with no payment history can be deleted.
      await page.getByRole("button", { name: "Members", exact: true }).click();
      await page
        .getByRole("button", { name: "Add member", exact: true })
        .click();
      await page
        .getByLabel("Full name", { exact: true })
        .fill("Delete Candidate");
      await page
        .getByLabel("Phone number", { exact: true })
        .fill("9876590000");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      const candidate = (await read()).members.find(
        (m) => m.name === "Delete Candidate",
      );
      assert.ok(candidate);
      await page
        .getByRole("button", { name: "Delete member", exact: true })
        .click();
      await page.getByRole("checkbox").check();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Delete member", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(
        (await read()).members.some((m) => m.id === candidate.id),
        false,
      );
      // A member with payment history is protected from deletion.
      await page
        .getByRole("button", { name: "Open Arjun Mehta", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Delete member", exact: true })
        .click();
      await page.getByRole("checkbox").check();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Delete member", exact: true })
        .click();
      await page
        .locator(".form-error-summary", { hasText: /payment records/ })
        .waitFor();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      // Ending a membership early records the chosen day.
      const today = await page.evaluate(() =>
        new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
          new Date(),
        ),
      );
      await page
        .getByRole("button", { name: "End access", exact: true })
        .first()
        .click();
      await page
        .getByLabel("End access on", { exact: false })
        .fill(today);
      await page
        .getByLabel("Reason", { exact: true })
        .fill("Requested early exit");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "End access", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      const arjun = (await read()).members.find((m) => m.name === "Arjun Mehta");
      assert.equal(
        (await read()).memberships.some(
          (s) => s.memberId === arjun.id && s.end === today,
        ),
        true,
      );
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
    "PASS: desktop/phone member validation, optional profile, duplicate-submit prevention, edits, partial/full payments, immediate receipts, replay protection, staff admin, plan deletion, member deletion guards and early membership expiry.",
  );
} finally {
  await browser.close();
}
