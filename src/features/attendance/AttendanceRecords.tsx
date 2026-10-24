import { useMemo } from "react";
import { Dumbbell } from "lucide-react";
import type { Attendance, Data } from "../../domain";
import type { HistoryQuery } from "../../data/history";
import { ServerHistory } from "../../shared/ServerHistory";
import { Paginated } from "../../shared/Paginated";
import { MemberAvatar } from "../../MemberAvatar";
import { VisitCheckout } from "./VisitCheckout";
import { formatClock } from "../../shared/formatters";

export function AttendanceRecords({
  data,
  records,
  query,
  inside,
  busy,
  checkout,
  correct,
}: {
  data: Data;
  records: Attendance[];
  query: HistoryQuery;
  inside: boolean;
  busy: boolean;
  checkout: (visit: Attendance) => void;
  correct?: (visit: Attendance) => void;
}) {
  const members = useMemo(
    () => new Map(data.members.map((m) => [m.id, m])),
    [data.members],
  );
  const revision = useMemo(() => ({}), [data.members, data.attendance]);
  const render = (visits: Attendance[]) => (
    <>
      <div
        className="record-scroll"
        role="region"
        aria-label="Attendance records"
        tabIndex={0}
      >
        {visits.map((visit) => {
          const member = members.get(visit.memberId);
          return (
            <div className="list-item attendance-entry" key={visit.id}>
              <MemberAvatar
                name={member?.name ?? "Unknown member"}
                photo={member?.photo}
              />
              <div>
                <strong>{member?.name ?? "Unknown member"}</strong>
                <small>
                  {visit.override
                    ? "Override: " + visit.override
                    : "Valid membership"}
                </small>
              </div>
              <span>{formatClock(visit.at)}</span>
              <VisitCheckout
                visit={visit}
                busy={busy}
                checkout={() => checkout(visit)}
              />
              {correct && (
                <button className="small-button" onClick={() => correct(visit)}>
                  Correct check-in
                </button>
              )}
            </div>
          );
        })}
      </div>
      {!visits.length && (
        <div className="empty">
          <Dumbbell size={26} />
          <p>
            {inside
              ? "No members are currently inside."
              : "No visits match this view."}
          </p>
        </div>
      )}
    </>
  );
  return data.capabilities?.attendancePages ? (
    <ServerHistory<Attendance>
      query={query}
      revision={revision}
      label="visits"
      render={render}
    />
  ) : (
    <Paginated records={records} label="visits" render={render} />
  );
}
