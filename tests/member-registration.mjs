import assert from "node:assert/strict";
import { launch, open, signIn } from "./live-harness.mjs";
import { seed } from "./fixtures.ts";
const browser = await launch();
try {
  const { page, errors } = await open(browser, { width: 1440, height: 900 });
  const fixture = seed();
  fixture.payments = [];
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
        path.endsWith("/get_gym_data") || path.endsWith("/my_role") ? 200 : 403,
      contentType: "application/json",
      body: JSON.stringify(
        path.endsWith("/get_gym_data")
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
  await page.locator(".movement-card.joined button").click();
  assert.equal(await page.locator(".movement-popup-list button").count(), 30);
  const listBox = await page.locator(".movement-popup-list").boundingBox();
  assert(listBox.height <= 482, "Monthly popup list must remain bounded");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Add member", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Full name", { exact: true })
    .fill("Registration Test");
  await dialog.getByLabel("Phone number", { exact: true }).fill("9876543219");
  await dialog.getByLabel("Start date", { exact: true }).fill("2026-01-31");
  assert.equal(
    await dialog.getByLabel("Expiry date", { exact: true }).inputValue(),
    "2026-02-27",
  );
  await dialog
    .getByLabel("Discount type", { exact: true })
    .selectOption("percent");
  await dialog.getByLabel("Discount", { exact: true }).fill("10");
  assert.match(
    await page
      .getByRole("complementary", { name: "Selected plan summary" })
      .innerText(),
    /1,080/,
  );
  for (const theme of ["light", "dark"]) {
    if ((await page.locator("html").getAttribute("data-theme")) !== theme) {
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Switch to " + theme + " theme",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Add member", exact: true })
        .click();
    }
    for (const width of [1440, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(
        await dialog
          .getByLabel("Full name", { exact: true })
          .evaluate(
            (el) =>
              parseFloat(getComputedStyle(el).fontSize) >=
              (innerWidth <= 760 ? 16 : 14),
          ),
        "Readable form input size",
      );
      assert(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        `Dialog overflow ${width}`,
      );
      await dialog.evaluate((el) => (el.scrollTop = el.scrollHeight));
      assert(
        await dialog
          .getByRole("button", { name: "Complete registration", exact: true })
          .isVisible(),
      );
      await dialog.evaluate((el) => (el.scrollTop = 0));
      if (width === 1440 || width === 390)
        await page.screenshot({
          path: `tests/artifacts/registration-${theme}-${width}.png`,
          animations: "disabled",
        });
    }
  }
  await dialog.getByLabel("Add membership", { exact: true }).uncheck();
  assert.equal(await dialog.locator('[name="plan"]').count(), 0);
  await dialog.getByLabel("Add membership", { exact: true }).check();
  await dialog
    .getByLabel("Full name", { exact: true })
    .fill("Registration Test");
  await dialog.getByLabel("Phone number", { exact: true }).fill("9876543219");
  const requestPromise = page.waitForRequest((r) =>
    r.url().endsWith("/gym_action"),
  );
  await dialog
    .getByRole("button", { name: "Complete registration", exact: true })
    .click();
  const payload = (await requestPromise).postDataJSON();
  assert.equal(payload.action_type, "member");
  assert.equal(payload.payload.enrollment.planId, fixture.plans[0].id);
  assert.equal(payload.payload.enrollment.amount, 120000);
  assert.equal(payload.payload.enrollment.payment.amount, 120000);
  assert.equal(payload.payload.enrollment.payment.method, "Cash");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: responsive registration, dates, discount summary, optional enrollment and combined request. Mocked services only.",
  );
} finally {
  await browser.close();
}
