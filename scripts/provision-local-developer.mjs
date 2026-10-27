import { execFileSync } from "node:child_process";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw Error("Pass the developer's email address as the only argument.");
// Read credentials in memory; never print or write service credentials.
let output;
try {
  output =
    process.platform === "win32"
      ? execFileSync(
          process.env.ComSpec || "cmd.exe",
          ["/d", "/s", "/c", "npx supabase status -o env"],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        )
      : execFileSync("npx", ["supabase", "status", "-o", "env"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
} catch {
  throw Error("Cannot inspect local Supabase. Start it before provisioning.");
}
const config = Object.fromEntries(
  [...output.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map((m) => [m[1], m[2]]),
);
if (
  !config.API_URL ||
  !["127.0.0.1", "localhost"].includes(new URL(config.API_URL).hostname)
)
  throw Error("This provisioning script only supports local Supabase.");
const key = config.SERVICE_ROLE_KEY || config.SECRET_KEY;
if (!key) throw Error("Local Supabase service credential is unavailable.");
async function request(path, method = "GET", body) {
  const response = await fetch(`${config.API_URL}/${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok)
    throw Error(
      result.msg ||
        result.message ||
        result.error_description ||
        `Local provisioning failed (${response.status}).`,
    );
  return result;
}
const gyms = await request("rest/v1/gyms?select=id,name");
if (gyms.length !== 1)
  throw Error(
    "Choose a gym explicitly before provisioning: this script requires exactly one local gym.",
  );
let user;
for (let page = 1; page <= 100; page++) {
  const batch = await request(`auth/v1/admin/users?page=${page}&per_page=200`);
  user = batch.users.find((u) => u.email?.toLowerCase() === email);
  if (user || batch.users.length < 200) break;
  if (page === 100) throw Error("Account lookup exceeded its bound.");
}
let invited = false;
if (!user) {
  const invitedUser = await request(
    "auth/v1/invite?redirect_to=" +
      encodeURIComponent("http://127.0.0.1:5173/"),
    "POST",
    { email },
  );
  user = invitedUser.user || invitedUser;
  invited = true;
}
const profiles = await request(
  `rest/v1/staff_profiles?select=gym_id&user_id=eq.${encodeURIComponent(user.id)}`,
);
const profile = profiles[0];
if (profile && profile.gym_id !== gyms[0].id)
  throw Error(
    "This account belongs to another gym; no privileges were changed.",
  );
await request("rest/v1/staff_profiles", "POST", {
  user_id: user.id,
  gym_id: gyms[0].id,
  role: "owner",
  enabled: true,
});
await request("rest/v1/developer_accounts", "POST", {
  user_id: user.id,
  gym_id: gyms[0].id,
  enabled: true,
});
console.log(
  JSON.stringify({
    email,
    accountId: user.id,
    gym: gyms[0].name,
    developerAccess: true,
    invited,
    invitationDelivery: invited
      ? "Local mail viewer: http://127.0.0.1:61324"
      : "Existing account; password unchanged",
  }),
);
