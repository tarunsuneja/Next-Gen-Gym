import type { Data, Member } from "../domain";
import { kolkataDay } from "../analytics";
/** Only the active operational page scans its histories. */
export function operationalLists(
  data: Data | null,
  members: Map<string, Member> | undefined,
  view: {
    page: string;
    query: string;
    filter: string;
    attendanceTab: string;
    day: string;
    range: { from: string; to: string } | null;
  },
) {
  const visiblePayments: Data["payments"] = [],
    attendanceRows: Data["attendance"] = [];
  if (!data) return { visiblePayments, attendanceRows };
  const query = view.query.toLowerCase();
  if (view.page === "Fees & receipts")
    for (const payment of data.payments) {
      if (view.range || view.filter === "Today") {
        if (payment.voided) continue;
        const day = kolkataDay(payment.at);
        if (
          view.range
            ? day < view.range.from || day > view.range.to
            : day !== view.day
        )
          continue;
      }
      if (
        (
          (members?.get(payment.memberId)?.name ?? "Unknown member") +
          " " +
          payment.receipt
        )
          .toLowerCase()
          .includes(query)
      )
        visiblePayments.push(payment);
    }
  if (view.page === "Attendance")
    for (const visit of data.attendance) {
      if (
        view.attendanceTab === "Inside"
          ? visit.day !== view.day || !!visit.outAt
          : view.range &&
            (visit.day < view.range.from || visit.day > view.range.to)
      )
        continue;
      const member = members?.get(visit.memberId);
      if (
        (member ? `${member.name} ${member.phone}` : "")
          .toLowerCase()
          .includes(query)
      )
        attendanceRows.push(visit);
    }
  return { visiblePayments, attendanceRows };
}
