import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { seed } from "./fixtures.ts";
import { chartBuckets, kolkataDay } from "../src/analytics.tsx";
import { latest, money } from "../src/domain.ts";
import { buildWorkspaceIndex } from "../src/domain/workspaceIndex.ts";
const data = seed(),
  day = "2026-10-24",
  template = data.payments[0];
const payments = Array.from({ length: 12000 }, (_, i) => ({
  ...template,
  id: String(i),
  amount: ((i % 19) + 1) * 100,
  at: `2026-${i % 2 ? "10" : "09"}-${String((i % 28) + 1).padStart(2, "0")}T12:00:00Z`,
}));
function median(fn) {
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    fn();
    samples.push(performance.now() - t);
  }
  return +samples.sort((a, b) => a - b)[2].toFixed(3);
}
let oldCalls = 0,
  newCalls = 0;
const days = Array.from({ length: 30 }, (_, i) =>
  new Date(Date.parse(day) - i * 86400000).toISOString().slice(0, 10),
);
const legacy = () =>
  days.map((day) =>
    payments
      .filter((p) => p.at.slice(0, 10) === day)
      .reduce((sum, p) => sum + p.amount, 0),
  );
const optimized = () =>
  chartBuckets("30", day, payments, (p) => p.slice(0, 10));
const before = legacy(),
  after = optimized()
    .buckets.map((b) => b.total)
    .reverse();
assert.deepEqual(after, before);
for (const date of days)
  for (const p of payments) {
    oldCalls++;
    p.at.slice(0, 10) === date;
  }
chartBuckets("30", day, payments, (p) => {
  newCalls++;
  return p.slice(0, 10);
});
assert.equal(newCalls, payments.length);
assert.equal(oldCalls, payments.length * 30);
const memberships = Array.from({ length: 6000 }, (_, i) => ({
  ...data.memberships[0],
  id: String(i),
  memberId: String(i % 3000),
  end: `2026-${i < 3000 ? "10" : "11"}-24`,
}));
const snapshot = {
  ...data,
  members: Array.from({ length: 3000 }, (_, i) => ({
    ...data.members[0],
    id: String(i),
    name: `Benchmark member ${i}`,
  })),
  memberships,
  payments: [],
};
const index = buildWorkspaceIndex(snapshot),
  ids = Array.from({ length: 3000 }, (_, i) => String(i));
for (const id of ids)
  assert.equal(index.latest(id)?.id, latest(snapshot, id)?.id);
const formatLegacy = () => {
  for (let i = 0; i < 500; i++)
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).format(i);
};
const formatNew = () => {
  for (let i = 0; i < 500; i++) money(i * 100);
};
const results = {
  dataset: {
    payments: payments.length,
    memberships: memberships.length,
    members: ids.length,
  },
  chart: {
    beforeMs: median(legacy),
    afterMs: median(optimized),
    beforeTimestampConversions: oldCalls,
    afterTimestampConversions: newCalls,
  },
  latestMembership: {
    beforeMs: median(() => ids.map((id) => latest(snapshot, id))),
    afterMs: median(() => {
      const idx = buildWorkspaceIndex(snapshot);
      return ids.map((id) => idx.latest(id));
    }),
  },
  currencyFormat: {
    beforeMs: median(formatLegacy),
    afterMs: median(formatNew),
  },
  notes:
    "Local algorithm microbenchmarks, medians of five runs. Indexed timing includes rebuilding the index. Not network timings, load-test throughput, or proof of million-user capacity.",
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/performance-benchmark.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
