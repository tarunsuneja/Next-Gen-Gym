import {
  frozen,
  today,
  type Data,
  type Membership,
  type Attendance,
} from "../domain";
/** One pass per immutable snapshot; no global cache of mutable fixture objects. */
export function buildWorkspaceIndex(data: Data) {
  const members = new Map(data.members.map((m) => [m.id, m]));
  const memberships = new Map<string, Membership[]>();
  const paid = new Map<string, number>();
  const balances = new Map<string, number>();
  const latestByMember = new Map<string, Membership>();
  const lastVisit = new Map<string, Attendance>();
  const membershipById = new Map(data.memberships.map((s) => [s.id, s]));
  for (const visit of data.attendance) lastVisit.set(visit.memberId, visit);

  if (data.dashboard) {
    for (const [membershipId, amount] of Object.entries(data.dashboard.paid))
      paid.set(membershipId, amount);
  } else
    for (const p of data.payments)
      if (!p.voided)
        paid.set(p.membershipId, (paid.get(p.membershipId) ?? 0) + p.amount);
  for (const s of data.memberships) {
    const previous = latestByMember.get(s.memberId);
    if (!s.cancelled && (!previous || s.end > previous.end))
      latestByMember.set(s.memberId, s);
    const rows = memberships.get(s.memberId) ?? [];
    rows.push(s);
    memberships.set(s.memberId, rows);
    balances.set(
      s.memberId,
      (balances.get(s.memberId) ?? 0) +
        Math.max(0, s.amount - (paid.get(s.id) ?? 0)),
    );
  }
  return {
    members,
    membershipById,
    lastVisit,
    latest: (memberId: string) => latestByMember.get(memberId),
    active: (memberId: string, day = today()) =>
      !members.get(memberId)?.archived &&
      (memberships.get(memberId) ?? []).some(
        (s) =>
          s.start <= day && s.end >= day && !s.cancelled && !frozen(s, day),
      ),
    overdue: (memberId: string, day = today()) =>
      (memberships.get(memberId) ?? []).reduce(
        (sum, s) =>
          sum +
          (s.dueDate && s.dueDate < day
            ? Math.max(0, s.amount - (paid.get(s.id) ?? 0))
            : 0),
        0,
      ),
    memberships,
    paid,
    balance: (memberId: string) => balances.get(memberId) ?? 0,
    outstanding: (period: Membership) =>
      Math.max(0, period.amount - (paid.get(period.id) ?? 0)),
  };
}
