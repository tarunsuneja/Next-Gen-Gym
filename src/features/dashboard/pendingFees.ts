import type { Data } from "../../domain";
import { buildWorkspaceIndex } from "../../domain/workspaceIndex";

/** Include every outstanding member, including fees whose due date is still ahead. */
export function pendingFeeRows(data: Data) {
  const index = buildWorkspaceIndex(data);
  return data.members
    .filter((member) => index.balance(member.id) > 0)
    .map((member) => ({
      id: member.id,
      member,
      amount: index.balance(member.id),
      due:
        (index.memberships.get(member.id) ?? [])
          .filter((period) => !period.cancelled && index.outstanding(period) > 0)
          .map((period) => period.dueDate || period.start)
          .sort()[0] ?? member.joined,
    }))
    .sort(
      (a, b) =>
        a.due.localeCompare(b.due) ||
        b.amount - a.amount ||
        a.id.localeCompare(b.id),
    );
}
