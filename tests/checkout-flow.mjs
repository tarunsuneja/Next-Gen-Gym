import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launch } from "./live-harness.mjs";
import { seed, dashboardFixture } from "./fixtures.ts";
import { today, expiry, shiftDay, balance } from "../src/domain.ts";
const browser = await launch();
await mkdir("tests/artifacts/checkout", { recursive: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: 1000 },
      }),
      page = await context.newPage(),
      data = seed(),
      errors = [],
      writes = [],
      requests = new Map();
    let failNext = false,
      failReload = false;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
    await page.route("https://fonts.gstatic.com/**", (r) => r.abort());
    const user = {
      id: "10000000-0000-4000-8000-000000000001",
      email: "checkout@example.invalid",
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
    };
    const token = [
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
    await page.route("**/auth/v1/**", (r) =>
      r.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          r.request().url().includes("/token")
            ? {
                access_token: token,
                refresh_token: "layout-only",
                token_type: "bearer",
                expires_in: 3600,
                user,
              }
            : user,
        ),
      }),
    );
    function payment(period, p, requestId) {
      data.payments.push({
        id: crypto.randomUUID(),
        requestId,
        membershipId: period.id,
        memberId: period.memberId,
        amount: p.amount,
        method: p.method,
        reference: p.reference || "",
        at: new Date().toISOString(),
        receipt: `GD-${String(data.payments.length + 1).padStart(6, "0")}`,
        voided: false,
        voidReason: "",
        memberName: data.members.find((m) => m.id === period.memberId).name,
      });
    }
    function membership(memberId, p) {
      const period = {
        id: crypto.randomUUID(),
        memberId,
        planName: data.plans.find((x) => x.id === p.planId).name,
        start: p.start,
        end: expiry(p.start, data.plans.find((x) => x.id === p.planId).months),
        amount: p.amount,
        baseAmount: p.baseAmount,
        discountType: p.discountType,
        discountValue: p.discountValue,
        dueDate: p.start,
      };
      data.memberships.push(period);
      if (p.amount > 0) payment(period, p.payment, p.payment.requestId);
    }
    await page.route("**/rest/v1/rpc/**", async (r) => {
      const endpoint = new URL(r.request().url()).pathname.split("/").at(-1);
      let result = null;
      if (endpoint === "get_gym_data" || endpoint === "get_gym_dashboard") {
        if (failReload) {
          failReload = false;
          await r.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ message: "reload unavailable" }),
          });
          return;
        }
        result =
          endpoint === "get_gym_dashboard" ? dashboardFixture(data) : data;
      } else if (endpoint === "my_role") result = "owner";
      else if (endpoint === "gym_action") {
        const a = r.request().postDataJSON();
        writes.push(a);
        if (failNext) {
          failNext = false;
          await r.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              message: "Checkout could not be saved. Please retry.",
            }),
          });
          return;
        }
        if (!requests.has(a.request_id)) {
          const p = a.payload;
          if (a.action_type === "member") {
            if (p.id)
              Object.assign(
                data.members.find((m) => m.id === p.id),
                p,
              );
            else {
              const m = {
                ...p,
                id: crypto.randomUUID(),
                joined: today(),
                archived: false,
              };
              delete m.enrollment;
              data.members.push(m);
              if (p.enrollment) membership(m.id, p.enrollment);
            }
          } else if (a.action_type === "membership") membership(p.memberId, p);
          else if (a.action_type === "payment")
            payment(
              data.memberships.find((s) => s.id === p.membershipId),
              p,
              a.request_id,
            );
          else if (a.action_type !== "export")
            throw Error("Unexpected test action " + a.action_type);
          requests.set(a.request_id, a);
        }
      } else throw Error("Unexpected RPC " + endpoint);
      await r.fulfill({
        contentType: "application/json",
        body: JSON.stringify(result),
      });
    });
    await page.goto("http://127.0.0.1:5173/", {
      waitUntil: "domcontentloaded",
    });
    await page.getByLabel("Email address").fill(user.email);
    await page.getByLabel("Password").fill("test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("heading", { name: "Dashboard", exact: true })
      .waitFor();
    async function nav(name) {
      if (width < 900)
        await page
          .getByRole("button", { name: "Open navigation", exact: true })
          .click();
      await page.getByRole("button", { name, exact: true }).click();
    }
    async function close() {
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
    }
    async function receipt() {
      await page
        .getByRole("heading", { name: "Payment receipt", exact: true })
        .waitFor();
      assert(await page.getByRole("dialog").innerText());
      const link = page.getByRole("link", {
        name: "WhatsApp receipt",
        exact: true,
      });
      const href = await link.getAttribute("href");
      assert(href.startsWith("https://wa.me/91"));
      assert(decodeURIComponent(href).includes("Receipt: GD-"));
      assert.equal(await link.getAttribute("target"), "_blank");
      await close();
    }
    await nav("Fees & receipts");
    await page
      .getByRole("button", { name: "Collect payment", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Receive full payment", exact: true })
      .click();
    assert.equal(writes.length, 0);
    await page.getByLabel("Search member", { exact: true }).fill("Arjun");
    await page.locator(".checkout-results button").first().click();
    const member = data.members[0],
      previous = data.memberships.find((s) => s.memberId === member.id);
    assert.equal(
      await page.getByLabel("Start date", { exact: true }).inputValue(),
      shiftDay(previous.end, 1),
    );
    await page
      .getByLabel("Membership plan", { exact: true })
      .selectOption(data.plans[1].id);
    await page
      .getByLabel("Discount type", { exact: true })
      .selectOption("percent");
    await page.getByLabel("Discount", { exact: true }).fill("10");
    assert.equal(
      await page
        .getByLabel("Amount received (₹)", { exact: true })
        .inputValue(),
      "2700.00",
    );
    assert(
      (await page
        .getByLabel("Amount received (₹)", { exact: true })
        .getAttribute("readonly")) !== null,
    );
    await page
      .getByLabel("Payment method", { exact: true })
      .selectOption("UPI");
    await page
      .getByRole("button", { name: "Receive full payment", exact: true })
      .click();
    assert.equal(writes.length, 0, "Missing reference must block submission");
    await page
      .getByLabel("Transaction reference", { exact: true })
      .fill("UPI-CHECKOUT-001");
    for (const theme of ["light", "dark"]) {
      if (theme === "dark") {
        await close();
        await page
          .getByRole("button", { name: "Switch to dark theme", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Collect payment", exact: true })
          .click();
        await page.getByLabel("Search member", { exact: true }).fill("Arjun");
        await page.locator(".checkout-results button").first().click();
      }
      assert(
        await page
          .getByRole("dialog")
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      );
      await page.screenshot({
        path: `tests/artifacts/checkout/purchase-${theme}-${width}.png`,
        animations: "disabled",
      });
    }
    // Reapply a deterministic discounted purchase after the theme comparison.
    await page
      .getByLabel("Membership plan", { exact: true })
      .selectOption(data.plans[1].id);
    await page
      .getByLabel("Discount type", { exact: true })
      .selectOption("percent");
    await page.getByLabel("Discount", { exact: true }).fill("10");
    await page
      .getByLabel("Payment method", { exact: true })
      .selectOption("UPI");
    await page
      .getByLabel("Transaction reference", { exact: true })
      .fill("UPI-CHECKOUT-001");
    await page
      .getByRole("button", { name: "Receive full payment", exact: true })
      .click();
    await receipt();
    assert.equal(writes.at(-1).action_type, "membership");
    assert.equal(writes.at(-1).payload.payment.amount, 270000);
    assert.equal(balance(data, member.id), 0);
    // Existing full balance settlement keeps the historic partial receipt.
    await page
      .getByRole("button", { name: "Collect payment", exact: true })
      .click();
    await page.getByLabel("Search member", { exact: true }).fill("Rohan");
    await page.locator(".checkout-results button").first().click();
    await page
      .getByRole("button", { name: "Clear existing balance", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("Amount received (₹)", { exact: true })
        .inputValue(),
      "700.00",
    );
    await page
      .getByRole("button", { name: "Receive full payment", exact: true })
      .click();
    await receipt();
    assert.equal(writes.at(-1).action_type, "payment");
    assert.equal(writes.at(-1).payload.amount, 70000);
    // A profile with a fully paid membership can renew immediately.
    await nav("Members");
    await page
      .getByRole("textbox", { name: "Search name, phone or member ID" })
      .fill("Arjun");
    await page
      .getByRole("button", { name: "Open Arjun Mehta", exact: true })
      .click();
    assert(
      await page
        .getByRole("button", { name: "Collect payment", exact: true })
        .isEnabled(),
    );
    await page.getByRole("button", { name: "Renew", exact: true }).click();
    const newest = data.memberships
      .filter((s) => s.memberId === member.id)
      .sort((a, b) => b.end.localeCompare(a.end))[0];
    assert.equal(
      await page.getByLabel("Start date", { exact: true }).inputValue(),
      shiftDay(newest.end, 1),
    );
    await page
      .getByRole("button", {
        name: "Complete membership & payment",
        exact: true,
      })
      .click();
    await receipt();
    // One registration submission carries member + membership + full payment; a retry preserves entered values.
    await nav("Dashboard");
    await page.getByRole("button", { name: "Add member", exact: true }).click();
    await page
      .getByLabel("Full name", { exact: true })
      .fill("Checkout New Member");
    await page.getByLabel("Phone number", { exact: true }).fill("9876543219");
    await page.getByLabel("Discount", { exact: true }).fill("200");
    assert.equal(
      await page
        .getByLabel("Amount received (₹)", { exact: true })
        .inputValue(),
      "1000.00",
    );
    failNext = true;
    await page
      .getByRole("button", { name: "Complete registration", exact: true })
      .click();
    await page
      .getByText("Checkout could not be saved. Please retry.", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Full name", { exact: true }).inputValue(),
      "Checkout New Member",
    );
    const failedId = writes.at(-1).request_id;
    await page
      .getByRole("button", { name: "Complete registration", exact: true })
      .click();
    await receipt();
    assert.equal(writes.at(-1).request_id, failedId);
    assert.equal(writes.at(-1).payload.enrollment.payment.amount, 100000);
    assert.equal(
      data.members.filter((m) => m.name === "Checkout New Member").length,
      1,
    );
    await page
      .getByRole("button", { name: "Edit member", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("heading", { name: "Payment received", exact: true })
        .count(),
      0,
    );
    await close();
    // Profile-only registration does not create a membership or receipt.
    await nav("Dashboard");
    await page.getByRole("button", { name: "Add member", exact: true }).click();
    await page.getByLabel("Full name", { exact: true }).fill("Profile Only");
    await page.getByLabel("Phone number", { exact: true }).fill("9876543220");
    await page.getByLabel("Add membership", { exact: true }).uncheck();
    await page
      .getByRole("button", { name: "Complete registration", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Edit member", exact: true })
      .waitFor();
    assert(!writes.at(-1).payload.enrollment);
    await page
      .getByRole("heading", { name: "Member registered", exact: true })
      .waitFor();
    const welcome = await page
      .getByRole("link", { name: "Send welcome", exact: true })
      .getAttribute("href");
    assert(welcome.includes("919876543220"));
    assert(decodeURIComponent(welcome).includes("Profile Only"));
    await close();
    await nav("Dashboard");
    await page.getByRole("button", { name: "Add member", exact: true }).click();
    await page
      .getByLabel("Full name", { exact: true })
      .fill("Committed Without Refresh");
    await page.getByLabel("Phone number", { exact: true }).fill("9876543221");
    await page.getByLabel("Add membership", { exact: true }).uncheck();
    failReload = true;
    await page
      .getByRole("button", { name: "Complete registration", exact: true })
      .click();
    await page
      .getByText(
        "Saved successfully, but updated records could not be loaded.",
        { exact: false },
      )
      .first()
      .waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(
      data.members.filter((m) => m.name === "Committed Without Refresh").length,
      1,
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "PASS: member-first full checkout, plan selection, discounts, reference validation, legacy settlement, renewal, atomic registration payload, retry preservation and profile-only save on desktop/mobile. Mocked services only.",
  );
} finally {
  await browser.close();
}
