import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({
  executablePath: process.env.GYMDESK_BROWSER_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.GYMDESK_TEST_URL || "http://127.0.0.1:5173/";
const todayIso = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const dialog = () => page.getByRole("dialog");
const summary = () => page.locator(".form-error-summary");
const steps = [];
const step = (label) => steps.push(label);
const summaryText = async () => {
  await summary().first().waitFor();
  return summary().first().innerText();
};

try {
  await mkdir("artifacts", { recursive: true });

  // ============================ 1. LOGIN ============================
  await page.goto(base);
  await page.getByRole("heading", { name: "Your day starts here." }).waitFor();
  assert(await page.getByLabel("Email address").isVisible());
  assert(await page.getByLabel("Password").isVisible());
  assert(await page.getByRole("button", { name: "Sign in" }).isVisible());
  assert(await page.getByRole("button", { name: "Forgot password?" }).isVisible());
  assert(await page.getByRole("button", { name: "Explore demo workspace" }).isVisible());
  await page.screenshot({ path: "artifacts/lifecycle-login.png", animations: "disabled" });
  step("login renders email/password, sign-in, forgot-password and demo entry");

  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByRole("heading", { name: "Reset your password" }).waitFor();
  assert.equal(await page.getByLabel("Password").count(), 0);
  assert(await page.getByRole("button", { name: "Send reset link" }).isVisible());
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await page.getByRole("heading", { name: "Your day starts here." }).waitFor();
  assert(await page.getByLabel("Password").isVisible());
  step("login toggles password-reset mode and returns");

  await page.getByLabel("Email address").fill("staff@gym.test");
  await page.getByLabel("Password").fill("secret12345");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".login .error[role=alert]").waitFor();
  assert((await page.locator(".login .error").innerText()).includes("Supabase is not connected"));
  step("login shows a friendly error when Supabase is not connected");

  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await page.getByRole("heading", { name: "A good day starts here." }).waitFor();
  step("demo workspace opens the dashboard");

  // ============================ 2. ADD MEMBER ============================
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await dialog().waitFor();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  assert((await summaryText()).includes("Enter a full name between 1 and 100"));
  assert.equal(await page.getByLabel("Full name").getAttribute("aria-invalid"), "true");
  step("member: blank name is rejected with a field error");

  await page.getByLabel("Full name").fill("Lifecycle Checker");
  await page.getByLabel("Phone number", { exact: true }).fill("12345");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  assert((await summaryText()).includes("valid mobile number"));
  step("member: short phone number is rejected");

  await page.getByLabel("Phone number", { exact: true }).fill("9000000010");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  assert((await summaryText()).includes("belongs to another member"));
  step("member: duplicate phone number is rejected");

  await page.getByLabel("Phone number", { exact: true }).fill("9888887777");
  await page.getByText("Additional details", { exact: false }).click();
  await page.getByLabel("Height (cm)").fill("400");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  assert((await summaryText()).includes("Enter height between 50 and 300 cm"));
  step("member: out-of-range height is rejected");

  await page.getByLabel("Height (cm)").fill("170");
  await page.getByLabel("Weight (kg)").fill("5");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  assert((await summaryText()).includes("Enter weight between 10 and 500 kg"));
  step("member: out-of-range weight is rejected");

  await page.getByLabel("Weight (kg)").fill("70");
  await page.getByLabel("Gender").selectOption("Male");
  await page.getByLabel("Address").fill("1 Lifecycle Lane, Bengaluru");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  await page.getByText("Member saved").waitFor();
  await page.getByRole("button", { name: "Add membership", exact: true }).waitFor();
  await page.getByText("1 Lifecycle Lane, Bengaluru").first().waitFor();
  step("member: valid record saves, opens profile and shows details");

  // edit member
  await page.getByRole("button", { name: "Edit member", exact: true }).click();
  await dialog().waitFor();
  await page.getByLabel("Address").fill("2 Updated Road, Bengaluru");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  await page.getByText("2 Updated Road, Bengaluru").first().waitFor({ timeout: 10000 });
  step("member: edit persists changes");

  // ============================ 3. ADD MEMBERSHIP ============================
  await page.getByRole("button", { name: "Add membership", exact: true }).click();
  await dialog().waitFor();
  assert(await page.getByLabel("Membership plan").isVisible());
  assert(await page.getByLabel("Start date").isVisible());
  assert(await page.getByLabel("Fee (₹)").isVisible());
  assert(await page.getByText("Membership period", { exact: false }).isVisible());

  // discount greater than the fee is rejected by the pricing widget
  await page.getByLabel("Discount type").selectOption("fixed");
  await page.getByLabel("Discount", { exact: true }).fill("2000");
  await page.locator(".form-error-summary, .error").first().waitFor();
  assert(
    (await page.locator(".error[role=alert]").first().innerText()).includes(
      "Discount must be between zero and the membership fee",
    ),
  );
  await page.getByLabel("Discount", { exact: true }).fill("0");
  await page.getByText("Final fee", { exact: false }).first().waitFor();
  step("membership: invalid discount is reported, valid discount restores the final fee");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  await page.getByText("Membership created").waitFor();
  await page.getByRole("heading", { name: "Membership history" }).waitFor();
  step("membership: valid plan/start/fee creates the membership");

  // overlap rejection
  await page.getByRole("button", { name: "Renew", exact: true }).click();
  await dialog().waitFor();
  await page.getByLabel("Start date").fill(todayIso);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  assert((await summaryText()).includes("overlap an existing membership"));
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  step("membership: overlapping dates are rejected");

  // ============================ 4. COLLECT PAYMENT ============================
  await page.getByRole("button", { name: "Collect payment", exact: true }).click();
  await dialog().waitFor();
  await page.getByText("Outstanding", { exact: false }).first().waitFor();
  assert(await page.getByRole("button", { name: "Use full outstanding amount" }).isVisible());

  await page.getByLabel("Amount (₹)").fill("999999");
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  assert((await summaryText()).toLowerCase().includes("less than or equal"));
  step("payment: amount above the outstanding balance is rejected");

  await page.getByLabel("Amount (₹)").fill("500");
  await page.getByText("This is a partial payment", { exact: false }).first().waitFor();
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await page.getByRole("heading", { name: "Payment receipt", exact: true }).waitFor();
  assert(await page.getByText("₹500", { exact: true }).last().isVisible());
  assert(await page.getByText(/DEMO-\d{4}/).first().isVisible());
  await page.screenshot({ path: "artifacts/lifecycle-receipt.png", animations: "disabled" });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  await page.getByText("₹1,000 pending", { exact: true }).first().waitFor();
  step("payment: partial payment records a numbered receipt and lowers the balance");

  // full-payment helper previews clearing the balance (cancelled, state unchanged)
  await page.getByRole("button", { name: "Collect payment", exact: true }).click();
  await dialog().waitFor();
  await page.getByRole("button", { name: "Use full outstanding amount" }).click();
  await page.getByText("fully paid", { exact: false }).first().waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  await page.getByText("₹1,000 pending", { exact: true }).first().waitFor();
  step("payment: full-amount helper previews clearing the balance");

  // ============================ 5. RECEIPT + VOID (Fees & receipts) ============================
  await page.getByRole("button", { name: "Fees & receipts", exact: true }).click();
  await page.getByRole("heading", { name: "Fees & receipts", exact: true }).waitFor();
  const row = page.locator("tr", { hasText: "Lifecycle Checker" });
  await row.first().waitFor();
  assert(await row.getByText("₹500", { exact: true }).first().isVisible());
  await row.getByRole("button", { name: /View receipt DEMO-/ }).first().click();
  await dialog().waitFor();
  await page.getByRole("button", { name: "Void payment", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  assert((await summaryText()).toLowerCase().includes("reason"));
  await page.getByLabel("Reason").fill("Lifecycle void correction");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  step("payment: receipt opens from the ledger and a documented void succeeds");

  // balance is restored after void
  await page.getByRole("button", { name: "Members", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search name, phone or member ID" })
    .fill("Lifecycle Checker");
  await page.getByRole("button", { name: "Lifecycle Checker 9888887777" }).click();
  await page.getByText("₹1,500 pending", { exact: true }).first().waitFor();
  step("payment: void restores the outstanding balance");

  // ============================ 6. PERSISTENCE ============================
  await page.reload();
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await page.getByRole("button", { name: "Members", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search name, phone or member ID" })
    .fill("Lifecycle Checker");
  await page.getByRole("button", { name: "Lifecycle Checker 9888887777" }).waitFor();
  step("persistence: records survive a full reload");

  assert.deepEqual(errors, [], errors.join("\n"));
  console.log("PASS (lifecycle): " + steps.join("; ") + ".");
} finally {
  await browser.close();
}
