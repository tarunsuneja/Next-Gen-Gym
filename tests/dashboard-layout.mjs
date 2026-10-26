import assert from "node:assert/strict";
import { launch, open, signIn } from "./live-harness.mjs";
import { seed } from "./fixtures.ts";
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
  await page.route("**/rest/v1/rpc/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      status:
        path.endsWith("/get_gym_data") ||
        path.endsWith("/get_gym_dashboard") ||
        path.endsWith("/my_role")
          ? 200
          : 403,
      contentType: "application/json",
      body: JSON.stringify(
        path.endsWith("/get_gym_data") || path.endsWith("/get_gym_dashboard")
          ? fixture
          : path.endsWith("/my_role")
            ? "owner"
            : { message: "Layout test does not allow writes." },
      ),
    });
  });
  await page.goto("http://127.0.0.1:5173/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.getByLabel("Email address").fill("layout@example.invalid");
  await page.getByLabel("Password").fill("layout-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  for (const width of [1440, 1000, 390]) {
    await page.setViewportSize({ width, height: 540 });
    if (width <= 720)
      await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    const sidebar = page.locator("aside.sidebar");
    assert(await sidebar.getByText("Gagandeep", { exact: true }).isVisible());
    assert(await sidebar.evaluate((el) => el.scrollWidth <= el.clientWidth));
    const nav = sidebar.getByRole("navigation");
    await nav.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    assert(await nav.evaluate((el) => el.scrollTop > 0), "Short viewports scroll navigation");
    const accountBox = await sidebar.getByRole("button", { name: "Sign out", exact: true }).boundingBox();
    assert(accountBox.y >= 0 && accountBox.y + accountBox.height <= 541, "Account stays in the viewport");
    await page.screenshot({ path: `tests/artifacts/sidebar-${width}.png`, animations: "disabled" });
    await nav.evaluate((el) => { el.scrollTop = 0; });
    if (width <= 720)
      await page.getByRole("button", { name: "Close navigation", exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(".movement-card.joined button").click();
  assert.equal(await page.locator(".movement-popup-list button").count(), 30);
  const listBox = await page.locator(".movement-popup-list").boundingBox();
  assert(listBox.height <= 482, "Monthly popup list must remain bounded");
  await page.keyboard.press("Escape");
  for (const width of [1440, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page
      .getByRole("button", {
        name: "View members joined this month",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Joined this month",
      exact: true,
    });
    assert(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
    assert.equal(
      await dialog.locator(".movement-popup-list button").count(),
      30,
    );
    await dialog
      .locator(".movement-popup-list")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    assert(
      await dialog
        .locator(".movement-popup-list")
        .evaluate((el) => el.scrollTop > 0),
    );
    await page.screenshot({
      path: `tests/artifacts/joined-popup-${width}.png`,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", {
        name: "View members who left this month",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog", { name: "Left this month", exact: true })
      .getByText("No departures recorded this month.", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
  }

  const collapsed = page.getByRole("button", {
    name: "Collapse sidebar",
    exact: true,
  });
  if (await collapsed.count()) await collapsed.click();
  for (const theme of ["light", "dark"]) {
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      await page
        .getByRole("button", {
          name: "Switch to " + theme + " theme",
          exact: true,
        })
        .click();
    for (const width of [1440, 1280, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `overflow ${width}`,
      );
      const metrics = await page.locator(".dashboard-metrics").boundingBox();
      assert(metrics.y < 240, `metrics start too low ${width}: ${metrics.y}`);
      assert.equal(
        await page
          .getByRole("button", { name: "Refresh workspace", exact: true })
          .count(),
        1,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Refresh", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByText("A good day starts here.", { exact: true })
          .count(),
        0,
      );
      const chartBox = await page.locator(".collection-panel").boundingBox();
      const planBox = await page.locator(".plan-distribution").boundingBox();
      const queueBox = await page.locator(".attention-panel").boundingBox();
      assert.equal(
        await page.locator(".dashboard-metrics > button").count(),
        5,
      );
      assert.equal(
        await page.locator(".dashboard-metrics > .movement-metric").count(),
        1,
      );
      assert.equal(
        await page.locator(".dashboard-board .movement-card").count(),
        0,
      );
      assert.equal(
        await page.locator(".distribution-donut strong").textContent(),
        "7",
      );
      const actionsBox = await page
        .locator(".quick-actions-panel")
        .boundingBox();
      assert(
        actionsBox.y < queueBox.y,
        "Quick actions precede the queue on every screen",
      );
      assert(
        chartBox.y >= actionsBox.y + actionsBox.height,
        "Collections stay below quick actions",
      );
      if (width > 1100) {
        assert(Math.abs(planBox.y - chartBox.y) < 3, "Charts must align");
        assert(
          queueBox.y >= actionsBox.y + actionsBox.height,
          "Attention remains below quick actions",
        );
      } else {
        assert(
          planBox.y >= chartBox.y + chartBox.height,
          "Charts stack cleanly on narrow screens",
        );
      }
      if (width === 1440 || width === 390)
        await page.screenshot({
          path: `tests/artifacts/dashboard-compact-${theme}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  const dashboard = () =>
    page.getByRole("button", { name: "Dashboard", exact: true }).click();
  assert.equal(
    await page.locator(".recent-members-panel .list-item-button").count(),
    5,
  );
  assert.equal(
    await page.locator(".pending-fees-panel .list-item-button").count(),
    5,
  );
  await page
    .getByRole("button", { name: "Add new member", exact: false })
    .click();
  await page
    .getByRole("dialog", { name: "Add a member", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Collect fee", exact: false }).click();
  await page
    .getByRole("dialog", { name: "Collect a payment", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "View all pending fees", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Member status filter").inputValue(),
    "Pending fees",
  );
  await dashboard();
  await page
    .getByRole("button", { name: "Add attendance", exact: false })
    .click();
  await page
    .getByRole("heading", { name: "Attendance", exact: true })
    .waitFor();
  await dashboard();
  await page
    .getByRole("button", { name: "Set up reminders", exact: false })
    .click();
  assert.equal(
    await page
      .getByRole("tab", { name: "Automated", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page
    .getByRole("heading", { name: "WhatsApp Cloud API", exact: true })
    .waitFor();
  await dashboard();
  await page
    .getByRole("button", { name: "View all recent members", exact: true })
    .click();
  await page.getByRole("heading", { name: "Members", exact: true }).waitFor();
  await dashboard();
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Open global search", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Global search", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Refresh workspace", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Refresh workspace", exact: true })
    .waitFor({ state: "visible" });
  const results = page.locator(".attention-results");
  assert.equal(
    await results.locator(".attention-row").count(),
    8,
    "Every matching member must be available",
  );
  assert(
    await results.evaluate((el) => el.scrollHeight > el.clientHeight),
    "Attention list must scroll",
  );
  await results.evaluate((el) => (el.scrollTop = el.scrollHeight));
  assert(await results.evaluate((el) => el.scrollTop > 0));
  await page
    .locator(".attention-tabs button")
    .filter({ hasText: "Renewals" })
    .click();
  assert.equal(
    await results.evaluate((el) => el.scrollTop),
    0,
    "Changing categories resets scroll",
  );
  await page
    .locator(".attention-tabs button")
    .filter({ hasText: "Payments" })
    .click();
  await page
    .getByRole("button", {
      name: "View all members needing attention",
      exact: true,
    })
    .click();
  assert.equal(
    await page.getByLabel("Member status filter").inputValue(),
    "Attention: Payments",
  );
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page
    .getByRole("button", { name: "View today's check-ins", exact: true })
    .click();
  await page.getByRole("tab", { name: "History", exact: true }).waitFor();
  await page.locator(".attendance-entry").first().waitFor();
  assert.equal(
    await page.locator(".attendance-entry").count(),
    3,
    "Today card opens all three visits including checkouts",
  );
  await dashboard();
  await page
    .getByLabel("Collection chart period", { exact: true })
    .selectOption("30");
  assert.equal(
    await page
      .getByLabel("Collection chart period", { exact: true })
      .inputValue(),
    "30",
  );
  assert.equal(await page.locator(".collections-track").count(), 30);
  await page.locator(".collections-track").first().click();
  assert.match(
    await page.locator(".collections-detail").innerText(),
    /collected/,
  );
  assert(
    await page
      .locator(".collections-scroll")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    "Thirty days have a readable scrollable chart",
  );

  await page
    .getByRole("button", { name: /View .* members/ })
    .filter({ has: page.locator(".distribution-dot") })
    .first()
    .click();
  assert.match(
    await page.getByLabel("Member status filter").inputValue(),
    /^Plan: /,
  );
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page
    .getByRole("button", {
      name: "View members joined this month",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog", { name: "Joined this month", exact: true })
    .locator(".movement-popup-list button")
    .first()
    .click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page
    .getByRole("button", { name: "Edit member", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: compact dashboard, one refresh control, desktop/tablet/phone, light/dark, add member and global search; no business records changed.",
  );
} finally {
  await browser.close();
}
