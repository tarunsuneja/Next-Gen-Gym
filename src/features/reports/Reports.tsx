import { buildWorkspaceIndex } from "../../domain/workspaceIndex";
import { WhatsAppLink, dueMessage } from "../../WhatsAppActions";
import { MemberAvatar } from "../../MemberAvatar";
import { useMemo, useState } from "react";
import {
  Search,
  CalendarDays,
  Wallet,
  Users,
  Activity,
  Download,
  Printer,
  ArrowUpRight,
} from "lucide-react";
import {
  type Data,
  type Member,
  type Membership,
  today,
  shiftDay,
  date,
  money,
  balance,
  overdue,
  latest,
  localDay,
  outstanding,
  membershipStatus,
  freezeMembership,
} from "../../domain";
import { Trend, daySpan, monthFirstDay } from "../../analytics";

type ReportRange = "month" | "last-month" | "30" | "90" | "year" | "custom";
const REPORT_RANGES: { key: ReportRange; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];
function reportBounds(key: ReportRange, t: string) {
  if (key === "last-month") {
    const prevTo = shiftDay(monthFirstDay(t), -1);
    return { start: monthFirstDay(prevTo), end: prevTo };
  }
  if (key === "30") return { start: shiftDay(t, -29), end: t };
  if (key === "90") return { start: shiftDay(t, -89), end: t };
  if (key === "year") return { start: t.slice(0, 4) + "-01-01", end: t };
  return { start: monthFirstDay(t), end: t };
}

export function Reports({
  data,
  download,
}: {
  data: Data;
  download: (name: string, rows: (string | number)[][]) => void;
}) {
  const now = today();
  const workspaceIndex = useMemo(
    () => buildWorkspaceIndex(data),
    [data.members, data.memberships, data.payments, data.attendance],
  );
  const [range, setRange] = useState<ReportRange>("month");
  const [customStart, setCustomStart] = useState(monthFirstDay(now));
  const [customEnd, setCustomEnd] = useState(now);
  const { start, end } =
    range === "custom"
      ? { start: customStart, end: customEnd }
      : reportBounds(range, now);
  const valid = !!start && !!end && start <= end;
  const days = valid ? daySpan(start, end) : 0;
  const prevEnd = valid ? shiftDay(start, -1) : "";
  const prevStart = valid ? shiftDay(prevEnd, -(days - 1)) : "";
  const note = days ? `vs prior ${days}d` : "";

  const period = (from: string, to: string) => {
    const payments = data.payments.filter(
      (p) => !p.voided && localDay(p.at) >= from && localDay(p.at) <= to,
    );
    const visits = data.attendance.filter((a) => a.day >= from && a.day <= to);
    const expired = data.memberships.filter(
      (s) => !s.cancelled && s.end >= from && s.end <= to,
    );
    const renewed = expired.filter((s) =>
      (workspaceIndex.memberships.get(s.memberId) ?? []).some(
        (x) =>
          x.id !== s.id &&
          x.memberId === s.memberId &&
          !x.cancelled &&
          x.start > s.end,
      ),
    );
    const joins = data.members.filter(
      (m) => !m.archived && m.joined >= from && m.joined <= to,
    );
    return { payments, visits, expired, renewed, joins };
  };
  const cur = period(start, end);
  const prev = period(prevStart, prevEnd);

  const cash = cur.payments.reduce((a, p) => a + p.amount, 0);
  const prevCash = prev.payments.reduce((a, p) => a + p.amount, 0);
  const uniqueVisitors = new Set(cur.visits.map((a) => a.memberId)).size;
  const rate = cur.expired.length
    ? Math.round((cur.renewed.length / cur.expired.length) * 100)
    : 0;
  const prevRate = prev.expired.length
    ? Math.round((prev.renewed.length / prev.expired.length) * 100)
    : 0;
  const lapsed = cur.expired.filter((s) => !cur.renewed.includes(s));
  const outstandingNow = data.members.reduce(
    (sum, m) => sum + workspaceIndex.balance(m.id),
    0,
  );

  const planTotals = new Map<string, { count: number; amount: number }>();
  for (const p of cur.payments) {
    const s = workspaceIndex.membershipById.get(p.membershipId);
    const key = s?.planName || "Unassigned";
    const row = planTotals.get(key) || { count: 0, amount: 0 };
    row.count += 1;
    row.amount += p.amount;
    planTotals.set(key, row);
  }
  const planRows = [...planTotals.entries()].sort(
    (a, b) => b[1].amount - a[1].amount,
  );
  const planMax = Math.max(1, ...planRows.map(([, v]) => v.amount));

  const byDay = new Map<string, number>();
  for (const a of cur.visits) byDay.set(a.day, (byDay.get(a.day) || 0) + 1);
  const topDays = [...byDay.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const avgPerDay = days ? Math.round((cur.visits.length / days) * 10) / 10 : 0;

  const member = (memberId: string) => workspaceIndex.members.get(memberId);
  const methods = ["Cash", "UPI", "Card", "Bank transfer"];

  return (
    <>
      <div className="tabs range-tabs" role="tablist" aria-label="Report range">
        {REPORT_RANGES.map((r) => (
          <button
            key={r.key}
            role="tab"
            aria-selected={range === r.key}
            className={range === r.key ? "active" : ""}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <section className="panel report-controls">
        <div className="report-range">
          <strong>
            {valid ? `${date(start)} – ${date(end)}` : "Choose a range"}
          </strong>
          <small>
            {valid
              ? `${days} day${days === 1 ? "" : "s"} · ${note} · excludes voids`
              : "Set a valid from and to date."}
          </small>
        </div>
        {range === "custom" && (
          <>
            <label>
              From
              <input
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={customEnd}
                min={customStart}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </label>
          </>
        )}
        <div className="report-actions">
          <button className="secondary" onClick={() => window.print()}>
            <Printer size={16} />
            Print / PDF
          </button>
          <button
            className="secondary"
            disabled={!valid}
            onClick={() =>
              download(`collections-${start}-${end}.csv`, [
                [
                  "Receipt",
                  "Date (India)",
                  "Member",
                  "Plan",
                  "Method",
                  "Reference",
                  "Amount (INR)",
                ],
                ...cur.payments.map((p) => {
                  const s = workspaceIndex.membershipById.get(p.membershipId);
                  return [
                    p.receipt,
                    localDay(p.at),
                    p.memberName || member(p.memberId)?.name || "",
                    s?.planName || "",
                    p.method,
                    p.reference,
                    p.amount / 100,
                  ];
                }),
              ])
            }
          >
            <Download size={17} />
            Export collections
          </button>
        </div>
      </section>
      {!valid && (
        <p className="error" role="alert">
          Choose a valid date range.
        </p>
      )}
      <div className="stats-grid report-metrics">
        <div className="stat panel">
          <Wallet />
          <span>Collections in range</span>
          <strong>{money(cash)}</strong>
          <small>
            {cur.payments.length} valid payments · excludes voids
            <Trend now={cash} prev={prevCash} label={note} />
          </small>
        </div>
        <div className="stat panel">
          <Users />
          <span>New members</span>
          <strong>{cur.joins.length}</strong>
          <small>
            Joined in range
            <Trend
              now={cur.joins.length}
              prev={prev.joins.length}
              label={note}
            />
          </small>
        </div>
        <div className="stat panel">
          <Activity />
          <span>Check-ins</span>
          <strong>{uniqueVisitors}</strong>
          <small>
            {cur.visits.length} check-ins · unique members
            <Trend
              now={cur.visits.length}
              prev={prev.visits.length}
              label={note}
            />
          </small>
        </div>
        <div className="stat panel">
          <CalendarDays />
          <span>Renewal rate</span>
          <strong>{rate}%</strong>
          <small>
            {cur.renewed.length} of {cur.expired.length} periods renewed
            <Trend now={rate} prev={prevRate} label={note} />
          </small>
        </div>
        <div className="stat panel">
          <Wallet />
          <span>Outstanding now</span>
          <strong>{money(outstandingNow)}</strong>
          <small>Current balance; independent of the date range</small>
        </div>
      </div>
      <div className="two-column">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Collections by plan</h2>
              <p>Collections grouped by membership plan</p>
            </div>
            <button
              className="text-button"
              disabled={!planRows.length}
              onClick={() =>
                download(`revenue-by-plan-${start}-${end}.csv`, [
                  ["Plan", "Payments", "Amount (INR)", "Share (%)"],
                  ...planRows.map(([name, v]) => [
                    name,
                    v.count,
                    v.amount / 100,
                    cash ? Math.round((v.amount / cash) * 100) : 0,
                  ]),
                ])
              }
            >
              Export
            </button>
          </div>
          {planRows.length === 0 ? (
            <p className="helper">No collections in this range.</p>
          ) : (
            planRows.map(([name, v]) => (
              <div className="plan-row" key={name}>
                <div className="plan-row-head">
                  <strong>{name}</strong>
                  <span>
                    {money(v.amount)} · {v.count} payment
                    {v.count === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="plan-track">
                  <div
                    className="plan-fill"
                    style={{ width: (v.amount / planMax) * 100 + "%" }}
                  />
                </div>
              </div>
            ))
          )}
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Attendance</h2>
              <p>Check-ins recorded across the range</p>
            </div>
            <button
              className="text-button"
              disabled={!cur.visits.length}
              onClick={() =>
                download(`attendance-${start}-${end}.csv`, [
                  ["Date", "Member", "Phone", "Recorded at"],
                  ...cur.visits.map((a) => [
                    a.day,
                    member(a.memberId)?.name || "",
                    member(a.memberId)?.phone || "",
                    localDay(a.at),
                  ]),
                ])
              }
            >
              Export
            </button>
          </div>
          <div className="list-item">
            <span>Average per day</span>
            <strong>{avgPerDay}</strong>
          </div>
          <div className="list-item">
            <span>Unique visitors</span>
            <strong>{uniqueVisitors}</strong>
          </div>
          <div className="list-item">
            <span>Total check-ins</span>
            <strong>{cur.visits.length}</strong>
          </div>
          {topDays.map(([day, n]) => (
            <div className="list-item" key={day}>
              <div>
                <strong>{date(day)}</strong>
                <small>
                  {n} check-in{n === 1 ? "" : "s"}
                </small>
              </div>
              <strong>{n}</strong>
            </div>
          ))}
        </section>
      </div>
      <div className="two-column">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Retention & lapsed</h2>
              <p>Periods that ended in range</p>
            </div>
            <button
              className="text-button"
              disabled={!lapsed.length}
              onClick={() =>
                download(`lapsed-members-${start}-${end}.csv`, [
                  ["Member", "Phone", "Plan", "Expired on", "Amount (INR)"],
                  ...lapsed.map((s) => [
                    member(s.memberId)?.name || "",
                    member(s.memberId)?.phone || "",
                    s.planName,
                    s.end,
                    s.amount / 100,
                  ]),
                ])
              }
            >
              Export
            </button>
          </div>
          <div className="list-item">
            <span>Renewal rate</span>
            <strong>{rate}%</strong>
          </div>
          <div className="list-item">
            <span>Renewed</span>
            <strong>{cur.renewed.length}</strong>
          </div>
          <div className="list-item">
            <span>Lapsed</span>
            <strong>{lapsed.length}</strong>
          </div>
          {lapsed.slice(0, 6).map((s) => (
            <div className="list-item" key={s.id}>
              <MemberAvatar
                name={member(s.memberId)?.name || "Former member"}
                photo={member(s.memberId)?.photo}
              />
              <div>
                <strong>{member(s.memberId)?.name || "Former member"}</strong>
                <small>
                  {s.planName} · ended {date(s.end)}
                </small>
              </div>
              <strong>{money(s.amount)}</strong>
            </div>
          ))}
          {lapsed.length > 6 && (
            <p className="helper">
              + {lapsed.length - 6} more lapsed periods · use Export for the
              full list
            </p>
          )}
        </section>
        <section className="panel report-methods">
          <div className="panel-header">
            <h2>Payment methods</h2>
          </div>
          {methods.map((method) => (
            <div className="list-item" key={method}>
              <strong>{method}</strong>
              <span>
                {money(
                  cur.payments
                    .filter((p) => p.method === method)
                    .reduce((sum, p) => sum + p.amount, 0),
                )}
              </span>
            </div>
          ))}
        </section>
      </div>
      <div className="two-column">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>New members</h2>
              <p>Joined in range</p>
            </div>
            <button
              className="text-button"
              disabled={!cur.joins.length}
              onClick={() =>
                download(`new-members-${start}-${end}.csv`, [
                  ["Name", "Phone", "Email", "Joined", "Gender"],
                  ...cur.joins.map((m) => [
                    m.name,
                    m.phone,
                    m.email,
                    m.joined,
                    m.gender,
                  ]),
                ])
              }
            >
              Export
            </button>
          </div>
          <div
            className="record-scroll"
            role="region"
            aria-label="New member report"
            tabIndex={0}
          >
            {cur.joins.length === 0 ? (
              <p className="helper">No new members joined in this range.</p>
            ) : (
              cur.joins.map((m) => (
                <div className="list-item" key={m.id}>
                  <MemberAvatar name={m.name} photo={m.photo} />
                  <div>
                    <strong>{m.name}</strong>
                    <small>{m.phone || "No phone on file"}</small>
                  </div>
                  <strong>{date(m.joined)}</strong>
                </div>
              ))
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>Outstanding balances</h2>
            <button
              className="text-button"
              onClick={() =>
                download("outstanding-balances.csv", [
                  ["Member", "Phone", "Outstanding (INR)", "Overdue (INR)"],
                  ...data.members
                    .filter((m) => workspaceIndex.balance(m.id) > 0)
                    .map((m) => [
                      m.name,
                      m.phone,
                      workspaceIndex.balance(m.id) / 100,
                      workspaceIndex.overdue(m.id, now) / 100,
                    ]),
                ])
              }
            >
              Export
            </button>
          </div>
          <div
            className="record-scroll"
            role="region"
            aria-label="Outstanding balance report"
            tabIndex={0}
          >
            {data.members.filter((m) => workspaceIndex.balance(m.id) > 0)
              .length === 0 ? (
              <p className="helper">No outstanding balances.</p>
            ) : (
              data.members
                .filter((m) => workspaceIndex.balance(m.id) > 0)
                .map((m) => (
                  <div className="list-item" key={m.id}>
                    <MemberAvatar name={m.name} photo={m.photo} />
                    <div>
                      <strong>{m.name}</strong>
                      <small>
                        {money(workspaceIndex.overdue(m.id, now))} overdue
                      </small>
                    </div>
                    <strong>{money(workspaceIndex.balance(m.id))}</strong>
                  </div>
                ))
            )}
          </div>
        </section>
      </div>
      <p className="helper">
        Collections record money received. These reports are operational
        summaries, not accounting revenue statements. Renewal counts describe
        periods, not unique members. Use Print / PDF to archive the current
        view.
      </p>
    </>
  );
}
