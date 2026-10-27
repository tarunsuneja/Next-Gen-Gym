import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { launch } from "./live-harness.mjs";
import { seed } from "./fixtures.ts";
const browser = await launch();
await mkdir("tests/artifacts/simplified", { recursive: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: 1000 },
      }),
      page = await context.newPage(),
      data = seed(),
      errors = [],
      writes = [];
    let acceptDialog = true;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => (acceptDialog ? d.accept() : d.dismiss()));
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
    }).format(new Date());
    data.audit = Array.from({ length: 40 }, (_, i) => ({
      id: `scroll-audit-${i}`,
      at: new Date().toISOString(),
      actor: userEmail(),
      action: "member",
      payload: { name: `Member ${i}` },
    }));
    function userEmail() {
      return "layout@example.invalid";
    }
    data.whatsapp.messages = Array.from({ length: 40 }, (_, i) => ({
      id: `scroll-message-${i}`,
      memberId: data.members[0].id,
      at: new Date().toISOString(),
      direction: "out",
      status: "sent",
      body: `Layout test message ${i}`,
      templateName: "payment_reminder",
    }));
    data.members[0].photo =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#cc1535"/></svg>',
      );
    data.members[1].photo = "data:image/jpeg;base64,broken";
    data.members[0].dob = "1995" + day.slice(4);
    data.members[0].joined = day;
    const user = {
      id: "10000000-0000-4000-8000-000000000001",
      email: "layout@example.invalid",
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
    await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
    await page.route("https://fonts.gstatic.com/**", (r) => r.abort());
    await page.route("**/auth/v1/**", (r) =>
      r.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          r.request().url().includes("/token")
            ? {
                access_token: token,
                refresh_token: "fixture-only",
                token_type: "bearer",
                expires_in: 3600,
                user,
              }
            : user,
        ),
      }),
    );
    await page.route("**/rest/v1/rpc/**", async (r) => {
      const path = new URL(r.request().url()).pathname;
      let result;
      if (path.endsWith("/get_gym_data") || path.endsWith("/get_gym_dashboard"))
        result = data;
      else if (path.endsWith("/my_role")) result = "owner";
      else if (path.endsWith("/is_developer")) result = false;
      else if (path.endsWith("/gym_action")) {
        const action = r.request().postDataJSON();
        writes.push(action);
        if (action.action_type === "member") {
          const m = data.members.find((m) => m.id === action.payload.id);
          Object.assign(m, action.payload);
        } else if (action.action_type === "checkout") {
          data.attendance.find((a) => a.id === action.payload.id).outAt =
            new Date().toISOString();
        } else if (action.action_type !== "export")
          throw Error("Unexpected fixture mutation " + action.action_type);
        result = null;
      } else throw Error("Unexpected RPC in layout fixture " + path);
      await r.fulfill({
        contentType: "application/json",
        body: JSON.stringify(result),
      });
    });
    await page.goto("http://127.0.0.1:5173/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.getByLabel("Email address").fill(user.email);
    await page.getByLabel("Password").fill("fixture-only");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("heading", { name: "Dashboard", exact: true })
      .waitFor();
    const nav = async (name) => {
      if (width === 390)
        await page
          .getByRole("button", { name: "Open navigation", exact: true })
          .click();
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("button", { name, exact: true })
        .click();
    };
    const screenshot = async (name) => {
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        name + " overflow",
      );
      await page.screenshot({
        path: `tests/artifacts/simplified/${name}-${width}.png`,
        fullPage: false,
        animations: "disabled",
      });
    };
    assert.equal(
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Messages", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("heading", { name: "Renewals coming up", exact: true })
        .count(),
      0,
    );
    await page.getByRole("button", { name: "This month", exact: true }).click();
    assert.equal(await page.locator(".movement-card.joined").count(), 1);
    await page.getByRole("button", { name: "7 days", exact: true }).click();
    assert.equal(await page.locator(".movement-card.joined").count(), 1);
    await screenshot("dashboard");
    await nav("Members");
    await page
      .getByRole("button", { name: "Open Arjun Mehta", exact: true })
      .click();
    await page.getByRole("tab", { name: "Overview", exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("heading", { name: "Membership history", exact: true })
        .count(),
      0,
    );
    await screenshot("profile-overview");
    await page.getByRole("tab", { name: "Memberships", exact: true }).click();
    await page
      .getByRole("heading", { name: "Membership history", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "End access", exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "Edit membership", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Expiry date", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .locator(".membership-controls .action-menu summary")
      .first()
      .click();
    assert(
      await page
        .getByRole("button", { name: "Cancel membership", exact: true })
        .isVisible(),
    );
    await page
      .locator(".membership-controls .action-menu summary")
      .first()
      .click();
    await screenshot("profile-memberships");
    for (const tab of ["Payments", "Attendance"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await screenshot("profile-" + tab.toLowerCase());
    }
    await page.locator(".profile-more summary").click();
    assert(
      await page
        .getByRole("link", { name: "WhatsApp wishes", exact: true })
        .isVisible(),
    );
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await page.getByText("Member archived", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Edit member", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    assert.equal(await dialog.locator('[name="archived"]').count(), 0);
    await dialog
      .locator('[name="notes"]')
      .fill("Fixture edit preserves archive state");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(writes.at(-1).payload.archived, true);
    assert.equal(data.members[0].archived, true);
    const more = page.locator(".profile-more");
    if (!((await more.getAttribute("open")) !== null))
      await more.locator("summary").click();
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await page.getByText("Member restored", { exact: true }).waitFor();
    await nav("Attendance");
    assert.equal(await page.locator(".attendance-entry").count(), 0);
    await page.getByRole("tab", { name: "Inside", exact: true }).click();
    assert.equal(await page.locator(".table-scroll").count(), 0);
    await page.locator(".attendance-entry").first().waitFor();
    assert.equal(await page.locator(".attendance-entry").count(), 3);
    await page
      .locator(".attendance-entry")
      .first()
      .getByRole("button", { name: "Check out", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll(".attendance-entry").length === 2,
    );
    await screenshot("attendance-inside");
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export inside", exact: true })
      .click();
    const csv = await readFile(await (await download).path(), "utf8");
    assert.equal(
      csv.trim().split(/\r?\n/).length,
      3,
      "inside export has two visible visits plus header",
    );
    await page.getByRole("tab", { name: "History", exact: true }).click();
    assert.equal(await page.locator(".attendance-entry").count(), 3);
    await screenshot("attendance-history");
    await nav("Reminders");
    await page.getByRole("tab", { name: "Automated", exact: true }).click();
    await page
      .getByRole("heading", { name: "Reminders due today", exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Log", exact: true }).count(),
      0,
    );
    await page.getByRole("button", { name: "Templates", exact: true }).click();
    await page
      .getByRole("button", { name: "New template", exact: true })
      .click();
    await page
      .getByLabel("Message body", { exact: true })
      .fill("Unsaved fixture {{member_name}}");
    acceptDialog = false;
    await nav("Settings");
    await page
      .getByRole("heading", { name: "Reminders", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Message body", { exact: true }).inputValue(),
      "Unsaved fixture {{member_name}}",
      "Page navigation must preserve rejected-discard edits",
    );
    await page.getByRole("tab", { name: "Delivery log", exact: true }).click();
    assert.equal(
      await page
        .getByRole("tab", { name: "Automated", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    acceptDialog = true;
    await page.getByRole("tab", { name: "Delivery log", exact: true }).click();
    await page
      .getByRole("heading", { name: "Message log", exact: true })
      .waitFor();
    assert.equal(
      await page.locator('[aria-label="Messaging sections"]').count(),
      0,
    );
    await screenshot("delivery-log");
    for (const mode of ["Manual", "Automated"]) {
      await page.getByRole("tab", { name: mode, exact: true }).click();
      await screenshot("reminders-" + mode.toLowerCase());
    }
    if (width === 1440) {
      await nav("Settings");
      await page
        .getByRole("button", { name: "Configure automation", exact: true })
        .click();
      assert.equal(
        await page
          .getByRole("tab", { name: "Automated", exact: true })
          .getAttribute("aria-selected"),
        "true",
      );
    }
    await nav("Reminders");
    await page.getByRole("tab", { name: "Automated", exact: true }).click();
    await page.getByRole("button", { name: "Setup", exact: true }).click();
    await page
      .getByLabel("Phone number ID", { exact: true })
      .fill("unsaved-phone-id");
    acceptDialog = false;
    await nav("Dashboard");
    await page
      .getByRole("heading", { name: "WhatsApp Cloud API", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Phone number ID", { exact: true }).inputValue(),
      "unsaved-phone-id",
    );
    await page
      .getByRole("button", { name: "Queue", exact: false })
      .first()
      .click();
    assert.equal(
      await page.getByLabel("Phone number ID", { exact: true }).inputValue(),
      "unsaved-phone-id",
    );
    acceptDialog = true;
    await nav("Dashboard");
    await page
      .getByRole("button", { name: "Open global search", exact: true })
      .click();
    await page.getByLabel("Search workspace", { exact: true }).fill("messages");
    await page
      .locator(".finder-results")
      .getByRole("button", { name: /Reminders/ })
      .click();
    await page
      .getByRole("heading", { name: "Reminders", exact: true })
      .waitFor();
    for (const theme of ["light", "dark"]) {
      if ((await page.locator("html").getAttribute("data-theme")) !== theme)
        await page
          .getByRole("button", {
            name: "Switch to " + theme + " theme",
            exact: true,
          })
          .click();
      for (const screenWidth of width === 390 ? [360, 390, 430] : [1440]) {
        await page.setViewportSize({ width: screenWidth, height: 1000 });
        for (const name of [
          "Dashboard",
          "Members",
          "Fees & receipts",
          "Attendance",
          "Reminders",
          "Settings",
          "Reports",
          "Audit",
        ]) {
          await nav(name);
          if (["Members", "Fees & receipts"].includes(name)) {
            assert(
              (await page.locator(".member-avatar img").count()) > 0,
              `${name} should show saved member photos`,
            );
          }
          if (name === "Dashboard") {
            assert.equal(
              await page.locator(".attention-member .member-avatar").count(),
              await page.locator(".attention-member").count(),
            );
          }
          const unreadable = await page
            .locator(
              "main .dashboard-mini-table td, main .dashboard-mini-table th, main .helper, main .panel-header h2, main .list-item strong",
            )
            .evaluateAll((elements) =>
              elements
                .filter(
                  (el) =>
                    el.getClientRects().length &&
                    parseFloat(getComputedStyle(el).fontSize) < 12,
                )
                .map((el) => ({
                  text: el.textContent.slice(0, 40),
                  size: getComputedStyle(el).fontSize,
                })),
            );
          assert.deepEqual(
            unreadable,
            [],
            `${name}: important content below readable type scale`,
          );
          for (const region of await page
            .locator(".record-scroll:visible")
            .all()) {
            assert(
              await region.evaluate(
                (el) => el.clientHeight <= innerHeight * 0.65 + 2,
              ),
              `${name}: list exceeds viewport bound`,
            );
          }
          if (name === "Audit") {
            const region = page.getByRole("region", {
              name: "Activity audit records",
              exact: true,
            });
            assert(
              await region.evaluate((el) => el.scrollHeight > el.clientHeight),
              "Long audit list must scroll",
            );
            await region.evaluate((el) => (el.scrollTop = el.scrollHeight));
            assert(await region.evaluate((el) => el.scrollTop > 0));
          }
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `${name} overflow at ${screenWidth} ${theme}`,
          );
        }
      }
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "PASS: consolidated navigation; dashboard deduplication; member tabs and secondary menus; archive-preserving edits; attendance checkout/history; reminder modes and unsaved-editor guard on desktop/phone. Only synthetic intercepted data used.",
  );
} finally {
  await browser.close();
}
