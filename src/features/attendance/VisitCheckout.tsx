import { today, type Attendance } from "../../domain";
import { formatClock } from "../../shared/formatters";
export function VisitCheckout({
  visit,
  busy,
  checkout,
}: {
  visit: Attendance;
  busy: boolean;
  checkout: () => void;
}) {
  const time = formatClock;
  const minutes = visit.outAt
    ? Math.max(
        0,
        Math.round((Date.parse(visit.outAt) - Date.parse(visit.at)) / 60000),
      )
    : 0;
  return (
    <div className="visit-checkout">
      {visit.outAt ? (
        <span>
          <strong>Out {time(visit.outAt)}</strong>
          <small>
            {minutes >= 60
              ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
              : `${minutes} min`}{" "}
            visit
          </small>
        </span>
      ) : visit.day === today() ? (
        <>
          <span className="badge green">Inside</span>
          <button className="small-button" disabled={busy} onClick={checkout}>
            Check out
          </button>
        </>
      ) : (
        <small>Check-out not recorded</small>
      )}
    </div>
  );
}
