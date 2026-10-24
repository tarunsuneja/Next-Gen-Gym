import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
let settings;
try {
  settings = JSON.parse(
    execFileSync(
      process.platform === "win32" ? "cmd.exe" : "npx",
      process.platform === "win32"
        ? ["/d", "/s", "/c", "npx supabase status -o json"]
        : ["supabase", "status", "-o", "json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
} catch {
  throw Error("Could not load local storage test credentials.");
}
const url = settings.API_URL,
  publicKey = settings.PUBLISHABLE_KEY || settings.ANON_KEY,
  secret = settings.SERVICE_ROLE_KEY || settings.SECRET_KEY;
assert(
  url?.startsWith("http://127.0.0.1:"),
  "Storage tests run only against local Supabase",
);
assert(publicKey && secret, "Local test credentials are required");
const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: publicKey, "content-type": "application/json" },
  body: JSON.stringify({ email: "owner@gym.local", password: "password123" }),
});
assert(login.ok, "Test owner authenticates");
const { access_token: token } = await login.json();
const headers = { apikey: publicKey, authorization: `Bearer ${token}` };
const gymResponse = await fetch(`${url}/rest/v1/rpc/my_gym`, {
  method: "POST",
  headers: { ...headers, "content-type": "application/json" },
  body: "{}",
});
assert(gymResponse.ok);
const gym = await gymResponse.json();
const bytes = Buffer.from(
  "temporary storage access contract " + crypto.randomUUID(),
);
const hash = createHash("sha256").update(bytes).digest("hex");
const path = `${gym}/${hash}.jpg`;
try {
  const upload = await fetch(`${url}/storage/v1/object/member-photos/${path}`, {
    method: "POST",
    headers: { ...headers, "content-type": "image/jpeg", "x-upsert": "true" },
    body: bytes,
  });
  assert(upload.ok, "Owner can upload gym-scoped photo");
  const signed = await fetch(
    `${url}/storage/v1/object/sign/member-photos/${path}`,
    {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ expiresIn: 60 }),
    },
  );
  assert(signed.ok, "Authorized signed URL");
  const signedData = await signed.json();
  const image = await fetch(`${url}/storage/v1${signedData.signedURL}`);
  assert.equal(image.status, 200);
  const anonymous = await fetch(
    `${url}/storage/v1/object/public/member-photos/${path}`,
  );
  assert(!anonymous.ok, "Photos are private");
  const denied = await fetch(
    `${url}/storage/v1/object/member-photos/00000000-0000-0000-0000-000000000000/${hash}.jpg`,
    {
      method: "POST",
      headers: { ...headers, "content-type": "image/jpeg" },
      body: bytes,
    },
  );
  assert(!denied.ok, "Cross-gym uploads denied");
  console.log(
    "PASS: local private photo upload, signed reads, public access denied, cross-gym upload denied. No member records changed.",
  );
} finally {
  const clean = await fetch(`${url}/storage/v1/object/member-photos`, {
    method: "DELETE",
    headers: {
      apikey: secret,
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ prefixes: [path] }),
  });
  assert(clean.ok, "Temporary object cleanup succeeds");
  await fetch(`${url}/auth/v1/logout`, { method: "POST", headers });
}
