import { type Data, shiftDay } from "../../domain";
import {
  dashWindow,
  chartBuckets,
  kolkataDay,
  type RangeKey,
} from "../../analytics";
import { buildWorkspaceIndex } from "../../domain/workspaceIndex";
/** One pass through each history, memoized by the caller for unrelated UI updates. */
export function dashboardMetrics(
  data: Data,
  t: string,
  dashboardRange: RangeKey,
  collectionRange: RangeKey,
  index: ReturnType<typeof buildWorkspaceIndex>,
) {
  const dashWin = dashWindow(dashboardRange, t);
  const inWindow = (day: string) => day >= dashWin.from && day <= dashWin.to;
  const inPrevious = (day: string) =>
    day >= dashWin.prevFrom && day <= dashWin.prevTo;
  const validPayments: Data["payments"] = [],
    todayPayments: Data["payments"] = [],
    rangePayments: Data["payments"] = [];
  let rangeCash = 0,
    prevCash = 0,
    rangeJoins = 0,
    prevJoins = 0,
    rangeVisits = 0,
    prevVisits = 0,
    pending = 0,
    activeCount = 0;
  for (const payment of data.payments) {
    if (payment.voided) continue;
    validPayments.push(payment);
    const day = kolkataDay(payment.at);
    if (day === t) todayPayments.push(payment);
    if (inWindow(day)) {
      rangePayments.push(payment);
      rangeCash += payment.amount;
    }
    if (inPrevious(day)) prevCash += payment.amount;
  }
  const currentMembers: Data["members"] = [],
    soon: Data["members"] = [],
    checkins: Data["attendance"] = [];
  const renewalCutoff = shiftDay(t, 7);
  for (const member of data.members) {
    pending += index.balance(member.id);
    if (inWindow(member.joined)) rangeJoins++;
    if (inPrevious(member.joined)) prevJoins++;
    if (member.archived) continue;
    currentMembers.push(member);
    if (index.active(member.id, t)) activeCount++;
    const period = index.latest(member.id);
    if (period && period.end >= t && period.end <= renewalCutoff)
      soon.push(member);
  }
  for (const visit of data.attendance) {
    if (visit.day === t) checkins.push(visit);
    if (inWindow(visit.day)) rangeVisits++;
    if (inPrevious(visit.day)) prevVisits++;
  }
  let rangePaymentCount = rangePayments.length;
  if (data.dashboard) {
    rangeCash = 0;
    prevCash = 0;
    rangePaymentCount = 0;
    rangeVisits = 0;
    prevVisits = 0;
    for (const payment of data.dashboard.paymentDays) {
      if (inWindow(payment.day)) {
        rangeCash += payment.amount;
        rangePaymentCount += payment.count;
      }
      if (inPrevious(payment.day)) prevCash += payment.amount;
    }
    for (const visit of data.dashboard.visitDays) {
      if (inWindow(visit.day)) rangeVisits += visit.count;
      if (inPrevious(visit.day)) prevVisits += visit.count;
    }
  }
  const chart = chartBuckets(collectionRange, t, validPayments, kolkataDay);
  if (data.dashboard) {
    const totals = new Map(
      data.dashboard.paymentDays.map((p) => [p.day, p.amount]),
    );
    const hours = new Map(
      data.dashboard.hours.map((p) => ["h" + p.hour, p.amount]),
    );
    for (const bucket of chart.buckets)
      bucket.total =
        collectionRange === "today"
          ? data.dashboard.day === t
            ? (hours.get(bucket.key) ?? 0)
            : 0
          : (totals.get(bucket.key) ?? 0);
  }
  const chartTotal = chart.buckets.reduce(
    (sum, bucket) => sum + bucket.total,
    0,
  );
  return {
    currentMembers,
    activeCount,
    pending,
    todayPayments,
    soon,
    checkins,
    dashWin,
    validPayments,
    rangeCash,
    prevCash,
    rangeJoins,
    prevJoins,
    rangeVisits,
    prevVisits,
    rangePayments,
    rangePaymentCount,
    chart,
    chartTotal,
  };
}
