import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { connect } from "./live-harness.mjs";
import { parseWorkspace } from "../src/data/workspaceContract.ts";
import { buildWorkspaceIndex } from "../src/domain/workspaceIndex.ts";
import { dashboardMetrics } from "../src/features/dashboard/selectors.ts";
const results = [];
for (const role of ["owner", "staff"]) {
  const client = await connect(`${role}@gym.local`, "password123");
  const revision = async () =>
    (await client.rpc("get_payment_export_page", { p_limit: 1 })).revision;
  const before = await revision();
  const complete = parseWorkspace(await client.rpc("get_gym_data"));
  const compact = parseWorkspace(await client.rpc("get_gym_dashboard"));
  assert.equal(
    await revision(),
    before,
    "Records changed during read-only verification; rerun on a stable dataset",
  );
  assert(compact.dashboard);
  const index = buildWorkspaceIndex(compact),
    fullIndex = buildWorkspaceIndex(complete);
  for (const member of complete.members) {
    assert.equal(index.balance(member.id), fullIndex.balance(member.id));
    assert.equal(index.overdue(member.id), fullIndex.overdue(member.id));
  }
  for (const range of ["today", "7", "30", "month"])
    for (const chartRange of ["today", "7", "30", "month"]) {
      const full = dashboardMetrics(
        complete,
        compact.dashboard.day,
        range,
        chartRange,
        fullIndex,
      );
      const summary = dashboardMetrics(
        compact,
        compact.dashboard.day,
        range,
        chartRange,
        index,
      );
      for (const field of [
        "pending",
        "activeCount",
        "rangeCash",
        "prevCash",
        "rangePaymentCount",
        "rangeJoins",
        "prevJoins",
        "rangeVisits",
        "prevVisits",
        "chartTotal",
      ])
        assert.equal(
          summary[field],
          full[field],
          `${role}/${range}/${chartRange}/${field}`,
        );
      assert.deepEqual(summary.chart, full.chart);
      assert.deepEqual(
        summary.checkins.map((a) => a.id).sort(),
        full.checkins.map((a) => a.id).sort(),
      );
    }
  results.push({
    role,
    members: complete.members.length,
    completePayments: complete.payments.length,
    startupPayments: compact.payments.length,
    completeVisits: complete.attendance.length,
    startupVisits: compact.attendance.length,
    completeBytes: Buffer.byteLength(JSON.stringify(complete)),
    startupBytes: Buffer.byteLength(JSON.stringify(compact)),
  });
}
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/dashboard-read-model.json",
  JSON.stringify(
    {
      results,
      notes:
        "Read-only local dataset, all dashboard/chart ranges. No write RPCs or provider calls. Payload observations are not throughput measurements.",
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ status: "PASS", results }));
