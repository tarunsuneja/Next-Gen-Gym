import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const seedFile = join(here, "..", "supabase", "seed_150.sql");

function docker(args) {
  return execFileSync("docker", args, { encoding: "utf8" }).trim();
}

const container = docker([
  "ps",
  "--filter",
  "name=supabase_db_Gym",
  "--format",
  "{{.ID}}",
]);

if (!container) {
  console.error("Local Supabase database container is not running.");
  console.error("Start it with: npm run db:start");
  process.exit(1);
}

docker(["cp", seedFile, `${container}:/tmp/seed_150.sql`]);
const out = docker([
  "exec",
  container,
  "psql",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-f",
  "/tmp/seed_150.sql",
]);
console.log(out);
console.log("Seeded ~150 members, memberships, payments and attendance.");
