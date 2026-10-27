import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import { type Data, type Member, date, money, today } from "../../domain";
import { MemberAvatar } from "../../MemberAvatar";
import { WhatsAppLink, dueMessage } from "../../WhatsAppActions";
import { pendingFeeRows } from "./pendingFees";

export function PendingPaymentsPreview({
  data,
  open,
  collect,
  viewAll,
}: {
  data: Data;
  open: (member: Member) => void;
  collect: (member: Member) => void;
  viewAll: () => void;
}) {
  const rows = useMemo(() => pendingFeeRows(data), [data]);
  const day = today();
  return (
    <section className="panel pending-fees-panel">
      <div className="panel-header">
        <div>
          <h2>Pending Payments</h2>
          <p>{rows.length} members with outstanding balances</p>
        </div>
        <button
          type="button"
          className="text-button"
          aria-label="View all pending payments"
          onClick={viewAll}
        >
          View All <ArrowUpRight size={15} />
        </button>
      </div>
      <div className="pending-fees-list">
        {rows.slice(0, 5).map(({ member, amount, due }) => (
          <div className="pending-whatsapp-row" key={member.id}>
            <button
              type="button"
              className="list-item-button"
              aria-label={`Open ${member.name}`}
              onClick={() => open(member)}
            >
              <MemberAvatar name={member.name} photo={member.photo} />
              <div>
                <strong>{member.name}</strong>
                <small>
                  {date(due)} ·{" "}
                  {due < day
                    ? "Overdue"
                    : due === day
                      ? "Due Today"
                      : "Upcoming"}
                </small>
              </div>
              <strong>{money(amount)}</strong>
            </button>
            <div className="pending-whatsapp-action">
              <button
                type="button"
                className="small-button"
                onClick={() => collect(member)}
              >
                Collect Payment
              </button>
              <WhatsAppLink
                phone={member.phone}
                message={dueMessage(data, member)}
              >
                WhatsApp Reminder
              </WhatsAppLink>
            </div>
          </div>
        ))}
        {!rows.length && (
          <div className="empty">
            <p>No pending payments.</p>
          </div>
        )}
      </div>
    </section>
  );
}
