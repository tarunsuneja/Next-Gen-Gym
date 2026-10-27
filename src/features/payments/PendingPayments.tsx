import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { type Data, type Member, date, money, today } from "../../domain";
import { pendingFeeRows } from "../dashboard/pendingFees";
import { Paginated } from "../../shared/Paginated";
import { MemberAvatar } from "../../MemberAvatar";
import { WhatsAppLink, dueMessage } from "../../WhatsAppActions";

export default function PendingPayments({
  data,
  open,
  collect,
}: {
  data: Data;
  open: (member: Member) => void;
  collect: (member: Member) => void;
}) {
  const [query, setQuery] = useState("");
  const all = useMemo(() => pendingFeeRows(data), [data]);
  const term = query.trim().toLowerCase();
  const rows = all.filter(({ member }) =>
    `${member.name} ${member.phone} ${member.id}`.toLowerCase().includes(term),
  );
  const day = today();
  return (
    <section className="panel pending-payments-panel">
      <div className="panel-header">
        <div>
          <h2>Pending Payments</h2>
          <p>
            {all.length} members ·{" "}
            {money(all.reduce((sum, row) => sum + row.amount, 0))} outstanding
          </p>
        </div>
      </div>
      <div className="toolbar">
        <div className="search">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Search pending payments"
            placeholder="Search member name or phone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <Paginated
        records={rows}
        label="pending payments"
        render={(visible) => (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Due Date</th>
                  <th>Pending Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ member, due, amount }) => (
                  <tr key={member.id}>
                    <td data-label="Member">
                      <button
                        type="button"
                        className="member-cell"
                        aria-label={`Open ${member.name}`}
                        onClick={() => open(member)}
                      >
                        <MemberAvatar name={member.name} photo={member.photo} />
                        <span>
                          <strong>{member.name}</strong>
                          <small>{member.phone}</small>
                        </span>
                      </button>
                    </td>
                    <td data-label="Due Date">{date(due)}</td>
                    <td data-label="Pending Amount">
                      <strong>{money(amount)}</strong>
                    </td>
                    <td data-label="Status">
                      <span
                        className={`badge ${due < day ? "red" : due === day ? "amber" : "neutral"}`}
                      >
                        {due < day
                          ? "Overdue"
                          : due === day
                            ? "Due Today"
                            : "Upcoming"}
                      </span>
                      {member.archived && (
                        <span className="badge">Archived Member</span>
                      )}
                    </td>
                  <td className="row-action" data-label="Actions">
                      <div className="toolbar-actions">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <div className="empty">
                <p>
                  {term
                    ? "No matching pending members."
                    : "No pending payments."}
                </p>
              </div>
            )}
          </div>
        )}
      />
    </section>
  );
}
