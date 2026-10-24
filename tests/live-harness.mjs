import { chromium } from "@playwright/test";

export const TEST_URL =
  process.env.GYMDESK_TEST_URL || "http://127.0.0.1:5173/";
export const SUPA_URL =
  process.env.VITE_SUPABASE_URL || "http://127.0.0.1:61321";
export const SUPA_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
export const OWNER_EMAIL = process.env.GYMDESK_OWNER_EMAIL || "owner@gym.local";
export const OWNER_PASSWORD =
  process.env.GYMDESK_OWNER_PASSWORD || "password123";

export function launch() {
  return chromium.launch({
    executablePath: process.env.GYMDESK_BROWSER_PATH || undefined,
  });
}

export async function connect(email = OWNER_EMAIL, password = OWNER_PASSWORD) {
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPA_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok)
    throw Error(`Sign-in failed (${res.status}): ${await res.text()}`);
  const { access_token } = await res.json();
  const rpc = async (name, body = {}) => {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: SUPA_KEY,
        authorization: `Bearer ${access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw Error(`${name} failed (${r.status}): ${await r.text()}`);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  };
  return { rpc };
}

export function read(client) {
  return client.rpc("get_gym_data");
}

export async function open(browser, viewport) {
  const context = await browser.newContext({
    viewport: viewport || { width: 1440, height: 1050 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  return { context, page, errors };
}

export async function signIn(
  page,
  email = OWNER_EMAIL,
  password = OWNER_PASSWORD,
) {
  await page.goto(TEST_URL);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page
    .getByRole("heading", { name: "Dashboard" })
    .waitFor();
}

export function unique(tag) {
  const stamp =
    Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `${tag} ${stamp}`;
}
