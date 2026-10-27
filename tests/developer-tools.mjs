import assert from "node:assert/strict";
import { launch, open, signIn } from "./live-harness.mjs";
import { seed } from "./fixtures.ts";
import { pendingFeeRows } from "../src/features/dashboard/pendingFees.ts";
const browser = await launch();
try {
  const { page, errors } = await open(browser, { width: 1440, height: 900 });
  const fixture = seed();
  fixture.payments.forEach((p) => (p.amount = Math.floor(p.amount / 2)));
  fixture.members = Array.from({ length: 30 }, (_, i) => ({
    ...fixture.members[i % fixture.members.length],
    id:
      i < fixture.members.length ? fixture.members[i].id : `layout-member-${i}`,
    name: `Member ${i}`,
    joined: new Date().toLocaleDateString("en-CA"),
  }));
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  const user = {
    id: "10000000-0000-4000-8000-000000000001",
    email: "layout@example.invalid",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
  };
  const jwt = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: "authenticated",
      }),
    ).toString("base64url"),
    "layout-only",
  ].join(".");
  await page.route("**/auth/v1/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        route.request().url().includes("/token")
          ? {
              access_token: jwt,
              refresh_token: "layout-only",
              token_type: "bearer",
              expires_in: 3600,
              user,
            }
          : user,
      ),
    }),
  );
  let revision = 1;
  const corrections = [];
  await page.route("**/rest/v1/rpc/**", (route) => {
    const endpoint = new URL(route.request().url()).pathname.split("/").at(-1);
    let result;
    if (["get_gym_data", "get_gym_dashboard"].includes(endpoint))
      result = fixture;
    else if (endpoint === "my_role") result = "owner";
    else if (endpoint === "is_developer") result = true;
    else if (endpoint === "developer_workspace")
      result = { data: fixture, revision: String(revision) };
    else if (endpoint === "developer_correct") {
      const payload = route.request().postDataJSON();
      if (payload.p_revision !== String(revision))
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            message:
              "Gym records changed. Reload and review the correction again.",
          }),
        });
      if (payload.p_action === "paymentDelete") {
        const payment = fixture.payments.find(
          (p) => p.id === payload.p_payload.id,
        );
        assert.equal(payload.p_payload.confirmReceipt, payment.receipt);
        fixture.payments = fixture.payments.filter((p) => p.id !== payment.id);
      } else {
        assert.equal(payload.p_action, "member");
        Object.assign(
          fixture.members.find((m) => m.id === payload.p_payload.id),
          payload.p_payload,
        );
      }
      corrections.push(payload);
      revision++;
      result = null;
    } else throw Error("Unexpected developer test RPC: " + endpoint);
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  await page.goto(
    `http://127.0.0.1:5173/#type=invite&access_token=${encodeURIComponent(jwt)}&refresh_token=invite-test`,
    { waitUntil: "domcontentloaded" },
  );
  await page
    .getByRole("button", { name: "Developer Tools", exact: true })
    .click();
  assert.equal(
    new URL(page.url()).hash,
    "",
    "Invite credentials must be removed from the address bar",
  );
  await page
    .getByRole("heading", { name: "Developer data cleanup", exact: true })
    .waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  const member = fixture.members[0];
  await page.getByLabel("Record", { exact: true }).selectOption(member.id);
  const next = JSON.parse(
    await page.getByLabel("Proposed fields (JSON)").inputValue(),
  );
  next.notes = "Reviewed developer fixture correction";
  await page.getByLabel("Proposed fields (JSON)").fill(JSON.stringify(next));
  await page
    .getByLabel("Reason for correction")
    .fill("Correct fixture member notes for test");
  await page
    .getByRole("button", { name: "Review correction", exact: true })
    .click();
  assert.equal(corrections.length, 0, "Review must never write");
  await page
    .getByRole("button", { name: "Confirm correction", exact: true })
    .click();
  await page
    .getByText("Correction saved and audited.", { exact: true })
    .waitFor();
  await page.getByLabel("Record", { exact: true }).selectOption(member.id);
  assert.equal(corrections.length, 1);
  assert.equal(
    JSON.parse(await page.getByLabel("Proposed fields (JSON)").inputValue())
      .notes,
    next.notes,
  );
  await page
    .getByLabel("Reason for correction")
    .fill("Try stale revision for test coverage");
  await page
    .getByRole("button", { name: "Review correction", exact: true })
    .click();
  revision++;
  await page
    .getByRole("button", { name: "Confirm correction", exact: true })
    .click();
  await page
    .getByText("Gym records changed. Reload and review the correction again.", {
      exact: true,
    })
    .waitFor();
  assert.equal(corrections.length, 1);
  await page
    .getByRole("button", { name: "Reload records", exact: true })
    .click();
  await page
    .getByLabel("Record type", { exact: true })
    .selectOption("payments");
  const receiptToDelete = { ...fixture.payments[0] };
  await page
    .getByLabel("Record", { exact: true })
    .selectOption(receiptToDelete.id);
  await page
    .getByLabel("Correction", { exact: true })
    .selectOption("paymentDelete");
  await page
    .getByLabel("Reason for correction")
    .fill("Delete the synthetic duplicate receipt fixture");
  await page
    .getByRole("button", { name: "Review correction", exact: true })
    .click();
  await page
    .getByText("Type the exact receipt number to confirm payment deletion.", {
      exact: true,
    })
    .waitFor();
  assert.equal(corrections.length, 1);
  await page
    .getByLabel("Type receipt number to delete", { exact: true })
    .fill(receiptToDelete.receipt);
  await page
    .getByRole("button", { name: "Review correction", exact: true })
    .click();
  assert.equal(corrections.length, 1);
  await page
    .getByRole("button", { name: "Delete payment permanently", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector('select[aria-label="Record"]')?.value === "",
  );
  assert.equal(corrections.length, 2);
  assert(!fixture.payments.some((p) => p.id === receiptToDelete.id));
  assert.deepEqual(errors, []);
  console.log(
    "PASS: developer navigation, record review, explicit correction, refresh, stale edit rejection and mobile layout. Mocked services only.",
  );
} finally {
  await browser.close();
}
