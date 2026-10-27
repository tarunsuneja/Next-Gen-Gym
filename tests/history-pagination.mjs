import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { launch } from "./live-harness.mjs";
import { seed, dashboardFixture } from "./fixtures.ts";
const browser = await launch();
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: 1000 },
      }),
      page = await context.newPage(),
      data = seed(),
      errors = [],
      requests = [];
    const payment = data.payments[0];
    data.payments = Array.from({ length: 45 }, (_, i) => ({
      ...payment,
      id: crypto.randomUUID(),
      receipt: `PAGE-${String(i + 1).padStart(3, "0")}`,
      at: new Date(Date.UTC(2026, 9, 1, 12, i)).toISOString(),
    }));
    const audits = Array.from({ length: 250 }, (_, i) => ({
      id: crypto.randomUUID(),
      actor: "owner@test.invalid",
      action: "member",
      payload: { note: `Audit ${i + 1}` },
      at: new Date(Date.UTC(2026, 9, 1, 12, i)).toISOString(),
    }));
    for (let i = 0; i < 30; i++) {
      const member = {
        ...data.members[0],
        id: crypto.randomUUID(),
        name: `Load member ${i}`,
      };
      data.members.push(member);
      data.memberships.push({
        ...data.memberships[0],
        id: crypto.randomUUID(),
        memberId: member.id,
        amount: 150000,
      });
    }
    const visit = data.attendance[0];
    data.attendance = Array.from({ length: 40 }, (_, i) => ({
      ...visit,
      id: crypto.randomUUID(),
      day: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
      at: new Date(Date.UTC(2026, 8, 1, 12, i)).toISOString(),
    }));
    data.audit = [];
    data.capabilities = {
      historyPages: true,
      paymentExports: true,
      attendancePages: true,
    };
    const exportRecords = [
      ...data.payments,
      ...Array.from({ length: 250 }, (_, i) => ({
        ...payment,
        id: crypto.randomUUID(),
        receipt: `SERVER-${i}`,
        at: new Date(Date.UTC(2026, 8, 1, 12, i)).toISOString(),
      })),
    ].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    let exportRevisionChange = false,
      fullReads = 0,
      failFullOnce = false;
    const user = {
      id: "10000000-0000-4000-8000-000000000001",
      email: "pages@test.invalid",
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
      "test",
    ].join(".");
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
    await page.route("https://fonts.gstatic.com/**", (r) => r.abort());
    await page.route("**/auth/v1/**", (r) =>
      r.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          r.request().url().includes("/token")
            ? {
                access_token: token,
                refresh_token: "test",
                token_type: "bearer",
                expires_in: 3600,
                user,
              }
            : user,
        ),
      }),
    );
    let failNext = false,
      slowStarted = false;
    await page.route("**/rest/v1/rpc/**", async (r) => {
      const endpoint = new URL(r.request().url()).pathname.split("/").at(-1),
        args = r.request().postDataJSON();
      let value = null;
      if (endpoint === "get_gym_data") {
        fullReads++;
        if (failFullOnce) {
          failFullOnce = false;
          await r.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ message: "History loading unavailable" }),
          });
          return;
        }
        value = data;
      } else if (endpoint === "get_gym_dashboard")
        value = dashboardFixture(data);
      else if (endpoint === "my_role") value = "owner";
      else if (endpoint === "is_developer") value = false;
      else if (endpoint === "get_payment_export_page") {
        assert.equal(args.p_limit, 250);
        if (args.p_revision && exportRevisionChange) {
          exportRevisionChange = false;
          await r.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              message:
                "Gym records changed during export. Please export again.",
            }),
          });
          return;
        }
        if (args.p_after_id)
          assert.equal(
            args.p_revision,
            "10000000-0000-4000-8000-000000000001:9007199254740993",
          );
        const source = exportRecords.filter(
          (row) =>
            !args.p_after_at ||
            row.at > args.p_after_at ||
            (row.at === args.p_after_at && row.id > args.p_after_id),
        );
        const rows = source.slice(0, 250).map((row) => ({
          id: row.id,
          at: row.at,
          cells: [
            row.receipt,
            "Member",
            row.at,
            row.method,
            row.amount / 100,
            row.voided ? "Voided" : "Valid",
          ],
        }));
        const last = rows.at(-1),
          hasMore = source.length > 250;
        value = {
          revision: "10000000-0000-4000-8000-000000000001:9007199254740993",
          rows,
          hasMore,
          nextCursor: hasMore ? { at: last.at, id: last.id } : null,
        };
      } else if (endpoint === "gym_action") {
        assert.equal(
          args.action_type,
          "export",
          "Only synthetic export audit allowed",
        );
      } else if (endpoint === "get_attendance_page") {
        let rows = [...data.attendance].sort(
          (a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id),
        );
        if (args.p_before_at)
          rows = rows.filter(
            (a) =>
              a.at < args.p_before_at ||
              (a.at === args.p_before_at && a.id < args.p_before_id),
          );
        rows = rows.slice(0, 11);
        const hasMore = rows.length > 10;
        rows = rows.slice(0, 10);
        const last = rows.at(-1);
        value = {
          rows,
          hasMore,
          nextCursor: hasMore ? { at: last.at, id: last.id } : null,
        };
      } else if (endpoint === "get_history_page") {
        requests.push(args);
        assert.equal(args.p_limit, 10);
        if (failNext) {
          failNext = false;
          await r.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ message: "History unavailable" }),
          });
          return;
        }
        if (args.p_query === "slow") {
          slowStarted = true;
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        let rows = [...(args.p_kind === "audit" ? audits : data.payments)].sort(
          (a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id),
        );
        if (args.p_query)
          rows = rows.filter((row) =>
            (row.receipt || row.action)
              .toLowerCase()
              .includes(args.p_query.toLowerCase()),
          );
        if (args.p_before_at)
          rows = rows.filter(
            (row) =>
              row.at < args.p_before_at ||
              (row.at === args.p_before_at && row.id < args.p_before_id),
          );
        const hasMore = rows.length > 10;
        rows = rows.slice(0, 10);
        const last = rows.at(-1);
        value = {
          rows,
          hasMore,
          nextCursor: hasMore ? { at: last.at, id: last.id } : null,
        };
      } else throw Error("Unexpected RPC " + endpoint);
      try {
        await r.fulfill({
          contentType: "application/json",
          body: JSON.stringify(value),
        });
      } catch (error) {
        if (!r.request().failure()) throw error;
      }
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
    assert.equal(fullReads, 0, "Dashboard startup must not fetch full history");
    assert.equal(
      await page.locator(".attention-row").count(),
      10,
      "Attention DOM is bounded despite a larger matching set",
    );
    await page
      .getByRole("button", { name: "Next attention page", exact: true })
      .click();
    assert(
      await page
        .getByRole("button", { name: "Previous attention page", exact: true })
        .isEnabled(),
    );
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
    const receipt = (n) =>
      page.getByRole("button", {
        name: `View receipt PAGE-${String(n).padStart(3, "0")}`,
        exact: true,
      });
    failFullOnce = true;
    await nav("Fees & receipts");
    await page
      .getByRole("heading", { name: "Workspace needs setup", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Search member or receipt").count(),
      0,
      "Incomplete financial data must not render after hydration fails",
    );
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await receipt(45).waitFor();
    assert.equal(
      fullReads,
      2,
      "Failed history hydration retries before rendering complete financial data",
    );
    assert.equal(
      await page.getByRole("button", { name: /^View receipt PAGE-/ }).count(),
      10,
    );
    await page
      .getByRole("button", { name: "Next payments page", exact: true })
      .click();
    await receipt(35).waitFor();
    assert.equal(await receipt(45).count(), 0);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const download = await downloadPromise;
    const csv = await readFile(await download.path(), "utf8");
    assert.equal(
      csv.trim().split(/\r?\n/).length,
      296,
      "Export includes all 295 server receipts, including history absent from the workspace",
    );
    exportRevisionChange = true;
    let partialDownloads = 0;
    const observeDownload = () => partialDownloads++;
    page.on("download", observeDownload);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page
      .getByText("Gym records changed during export. Please export again.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      partialDownloads,
      0,
      "A changed revision must not download a partial CSV",
    );
    assert(
      await page
        .getByRole("button", { name: "Export", exact: true })
        .isEnabled(),
    );
    const retryDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await retryDownload;
    page.off("download", observeDownload);
    await page
      .getByRole("button", { name: "Previous payments page", exact: true })
      .click();
    await receipt(45).waitFor();
    await page.getByLabel("Search member or receipt").fill("PAGE-001");
    await receipt(1).waitFor();
    assert.equal(
      await page.getByRole("button", { name: /^View receipt PAGE-/ }).count(),
      1,
    );
    assert(
      await page
        .getByRole("button", { name: "Next payments page", exact: true })
        .isDisabled(),
    );
    await page.getByLabel("Search member or receipt").fill("");
    await receipt(45).waitFor();
    failNext = true;
    await page
      .getByRole("button", { name: "Next payments page", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Retry payments", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Retry payments", exact: true })
      .click();
    await receipt(35).waitFor();
    await page.getByLabel("Search member or receipt").fill("slow");
    await page.waitForRequest(
      (r) =>
        r.url().includes("get_history_page") &&
        r.postDataJSON()?.p_query === "slow",
    );
    await page.getByLabel("Search member or receipt").fill("PAGE-001");
    await receipt(1).waitFor();
    await page.waitForTimeout(350);
    assert(slowStarted);
    assert.equal(
      await receipt(1).count(),
      1,
      "Late search responses cannot replace the latest result",
    );
    await nav("Attendance");
    await page.getByRole("tab", { name: "History", exact: true }).click();
    await page.getByText("Page 1 · 10 visits", { exact: true }).waitFor();
    assert.equal(
      await page.locator(".attendance-entry").count(),
      10,
      "Attendance history mounts only the current page",
    );
    await page
      .getByRole("button", { name: "Next visits page", exact: true })
      .click();
    await page.getByText("Page 2 · 10 visits", { exact: true }).waitFor();
    assert.equal(await page.locator(".attendance-entry").count(), 10);
    await nav("Audit");
    await page.locator(".audit-row").first().waitFor();
    assert.equal(await page.locator(".audit-row").count(), 10);
    await page
      .getByRole("button", { name: "Next audit records page", exact: true })
      .click();
    await page
      .getByText("Page 2 · 10 audit records", { exact: true })
      .waitFor();
    assert.equal(await page.locator(".audit-row").count(), 10);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "PASS: server history bounds, next/previous, query reset, stale-response cancellation, retry, complete exports and audit paging on desktop/mobile. Synthetic data only.",
  );
} finally {
  await browser.close();
}
