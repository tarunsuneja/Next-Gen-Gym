import { memo, useMemo } from "react";
import { type Data, today, frozen } from "./domain";
const COLORS = [
  "#6d28d9",
  "#1296e8",
  "#00716f",
  "#aa1959",
  "#ff5068",
  "#a66b12",
];
export const PlanDistribution = memo(function PlanDistribution({
  data,
  open,
  day = today(),
}: {
  data: Data;
  day?: string;
  open: (name: string, ids: string[]) => void;
}) {
  const { entries, total } = useMemo(() => {
    const activeByMember = new Map<string, (typeof data.memberships)[number]>();
    for (const s of data.memberships)
      if (
        !activeByMember.has(s.memberId) &&
        !s.cancelled &&
        s.start <= day &&
        s.end >= day &&
        !frozen(s, day)
      )
        activeByMember.set(s.memberId, s);
    const groups = new Map<string, string[]>();
    for (const member of data.members) {
      if (member.archived) continue;
      const membership = activeByMember.get(member.id);
      if (!membership) continue;
      const ids = groups.get(membership.planName) ?? [];
      ids.push(member.id);
      groups.set(membership.planName, ids);
    }
    const entries = [...groups].sort((a, b) => b[1].length - a[1].length);
    return {
      entries,
      total: entries.reduce((sum, [, ids]) => sum + ids.length, 0),
    };
  }, [data.members, data.memberships, day]);
  let offset = 0;
  return (
    <section className="panel plan-distribution labeled-plan-distribution">
      <div className="panel-header">
        <div>
          <h2>Membership plans</h2>
          <p>Current active members by plan</p>
        </div>
      </div>
      {total ? (
        <div className="distribution-body">
          <div
            className="distribution-donut"
            role="group"
            aria-label={`${total} active members across ${entries.length} plans`}
          >
            <svg
              viewBox="0 0 240 240"
              role="group"
              aria-label="Membership plan distribution"
            >
              <circle
                cx="120"
                cy="120"
                r="80"
                fill="none"
                stroke="var(--line)"
                strokeWidth="25"
              />
              {entries.map(([name, ids], i) => {
                const percent = (ids.length / total) * 100;
                const start = offset;
                offset += percent;
                const angle =
                  ((start + percent / 2) / 100) * Math.PI * 2 - Math.PI / 2;
                const labelX = 120 + Math.cos(angle) * 105;
                const labelY = 120 + Math.sin(angle) * 105;
                return (
                  <g key={name}>
                    <circle
                      cx="120"
                      cy="120"
                      r="80"
                      fill="none"
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth="25"
                      pathLength="100"
                      strokeDasharray={`${percent} ${100 - percent}`}
                      strokeDashoffset={-start}
                      transform="rotate(-90 120 120)"
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${name}: ${ids.length} members, ${Math.round(percent)} percent`}
                      onClick={() => open(name, ids)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          open(name, ids);
                        }
                      }}
                    />
                    {percent >= 4 && (
                      <text
                        x={labelX}
                        y={labelY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="distribution-percentage"
                        aria-hidden="true"
                      >
                        {Math.round(percent)}%
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <div>
              <strong>{total}</strong>
              <span>Active members</span>
            </div>
          </div>
          <div
            className="distribution-legend"
            role="group"
            aria-label="Active members per plan"
          >
            {entries.map(([name, ids], i) => (
              <button
                type="button"
                key={name}
                onClick={() => open(name, ids)}
                aria-label={`View ${name} members`}
              >
                <span
                  className="distribution-dot"
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                <span>{name}</span>
                <strong>{ids.length}</strong>
                <small>{Math.round((ids.length / total) * 100)}%</small>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty">
          <p>No active memberships yet.</p>
        </div>
      )}
    </section>
  );
});
