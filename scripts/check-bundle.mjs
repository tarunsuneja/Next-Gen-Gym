import { readFile, mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";
const manifest = JSON.parse(await readFile("dist/.vite/manifest.json", "utf8"));
const budgets = JSON.parse(await readFile("performance-budgets.json", "utf8"));
const eager = new Set(),
  visited = new Set();
function visit(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const chunk = manifest[key];
  assert(chunk, `Missing manifest chunk: ${key}`);
  eager.add(chunk.file);
  for (const css of chunk.css ?? []) eager.add(css);
  for (const dependency of chunk.imports ?? []) visit(dependency);
}
for (const [key, chunk] of Object.entries(manifest))
  if (chunk.isEntry) visit(key);
assert(eager.size, "No entry chunks in the build manifest");
const all = new Set([
  ...Object.values(manifest).map((chunk) => chunk.file),
  ...eager,
]);
const assets = await Promise.all(
  [...all]
    .filter((file) => /\.(js|css)$/.test(file))
    .map(async (file) => {
      assert(
        !file.includes("..") && !file.startsWith("/"),
        "Invalid manifest path",
      );
      const bytes = await readFile(`dist/${file}`);
      return {
        file,
        bytes: bytes.length,
        gzip: gzipSync(bytes).length,
        initial: eager.has(file),
      };
    }),
);
const sum = (predicate) =>
  assets.filter(predicate).reduce((n, a) => n + a.gzip, 0);
const measured = {
  initialJsGzip: sum((a) => a.initial && a.file.endsWith(".js")),
  initialCssGzip: sum((a) => a.initial && a.file.endsWith(".css")),
  totalJsGzip: sum((a) => a.file.endsWith(".js")),
};
const checks = Object.entries(measured).map(([name, bytes]) => ({
  name,
  bytes,
  limit: budgets[name],
  pass: bytes <= budgets[name],
}));
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/bundle-budget.json",
  JSON.stringify(
    {
      checks,
      assets,
      notes:
        "Gzip artifact budgets; not real-user Core Web Vitals or measured network transfer.",
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(checks));
if (checks.some((check) => !check.pass)) process.exitCode = 1;
