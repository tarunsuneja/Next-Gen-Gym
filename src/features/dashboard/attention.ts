import { shiftDay, type Data } from "../../domain";
import { buildWorkspaceIndex } from "../../domain/workspaceIndex";

export const attentionCategories = [
  "Expiring memberships",
  "Absent 14+ days",
  "Members without a plan",
] as const;
export type AttentionCategory = (typeof attentionCategories)[number];
export const attentionDescriptions: Record<AttentionCategory, string> = {
  "Members without a plan":
    "Registered members with no assigned membership plan.",
  "Expiring memberships":
    "Memberships ending within 7 days or already expired. Fully paid members can appear here.",
  "Absent 14+ days":
    "Active members with no recorded visit for at least 14 days.",
};

export function attentionGroups(
  data: Data,
  day: string,
  index = buildWorkspaceIndex(data),
) {
  return new Map(
    attentionCategories.map((category) => [
      category,
      data.members
        .filter((member) => {
          if (member.archived) return false;
          const periods = index.memberships.get(member.id) ?? [];
          const latest = index.latest(member.id);
          if (category === "Members without a plan") return !latest;
          if (category === "Expiring memberships")
            return (
              !!latest &&
              latest.end <= shiftDay(day, 7) &&
              !periods.some((period) => !period.cancelled && period.start > day)
            );
          if (!index.active(member.id, day)) return false;
          const current = periods.find(
            (period) =>
              !period.cancelled && period.start <= day && period.end >= day,
          );
          if (!current) return false;
          const since = [
            current.start,
            member.joined,
            index.lastVisit.get(member.id)?.day ?? "",
          ]
            .sort()
            .at(-1)!;
          return since <= shiftDay(day, -14);
        })
        .sort(
          (a, b) =>
            (category === "Expiring memberships"
              ? (index.latest(a.id)?.end ?? "").localeCompare(
                  index.latest(b.id)?.end ?? "",
                )
              : index.overdue(b.id, day) - index.overdue(a.id, day)) ||
            index.balance(b.id) - index.balance(a.id) ||
            a.name.localeCompare(b.name),
        ),
    ]),
  );
}
