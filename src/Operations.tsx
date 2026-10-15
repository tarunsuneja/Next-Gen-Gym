import { useState } from "react";
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
} from "./domain";
import { Trend, daySpan, monthFirstDay } from "./analytics";

export function MemberFinder({
  data,
  open,
  actions = [],
  receipt,
}: {
  data: Data;
  open: (m: Member) => void;
  actions?: { label: string; run: () => void }[];
  receipt?: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const matches = q.trim()
    ? data.members
        .filter((m) =>
          `${m.name} ${m.phone} ${m.id}`
            .toLowerCase()
            .includes(q.trim().toLowerCase()),
        )
        .slice(0, 6)
    : [];
  return (
    <section className="member-finder">
      <label>
        <Search size={19} />
        <span className="sr-only">Search workspace</span>
        <input
          aria-label="Search workspace"
          placeholder="Search members, receipts or pages…"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {(q.trim() || actions.length > 0) && (
        <div className="finder-results">
          {actions
            .filter(
              (a) =>
                !q.trim() ||
                a.label.toLowerCase().includes(q.trim().toLowerCase()),
            )
            .map((a) => (
              <button key={a.label} onClick={a.run}>
                <span>
                  <strong>{a.label}</strong>
                  <small>Go to page</small>
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))}
          {matches.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setQ("");
                open(m);
              }}
            >
              <span>
                <strong>{m.name}</strong>
                <small>
                  {m.phone} ·{" "}
                  {m.archived
                    ? "Archived"
                    : latest(data, m.id)
                      ? membershipStatus(latest(data, m.id))
                      : "No membership"}
                </small>
              </span>
              <ArrowUpRight size={18} />
            </button>
          ))}
          {q.trim() &&
            receipt &&
            data.payments
              .filter((p) =>
                p.receipt.toLowerCase().includes(q.trim().toLowerCase()),
              )
              .slice(0, 4)
              .map((p) => (
                <button key={p.id} onClick={() => receipt(p.id)}>
                  <span>
                    <strong>{p.receipt}</strong>
                    <small>
                      {p.memberName ||
                        data.members.find((m) => m.id === p.memberId)
                          ?.name}{" "}
                      · {money(p.amount)}
                      {p.voided ? " · Voided" : ""}
                    </small>
                  </span>
                  <ArrowUpRight size={18} />
                </button>
              ))}
          {q.trim() &&
            !matches.length &&
            !actions.some((a) =>
              a.label.toLowerCase().includes(q.trim().toLowerCase()),
            ) &&
            !data.payments.some((p) =>
              p.receipt.toLowerCase().includes(q.trim().toLowerCase()),
            ) && (
              <p>
                No matching results. Try a name, phone number, receipt number or
                page.
              </p>
            )}
        </div>
      )}
    </section>
  );
}

export function AttentionQueue({
  data,
  open,
  pay,
  renew,
  contact,
}: {
  data: Data;
  open: (m: Member) => void;
  pay: (m: Member) => void;
  renew: (m: Member) => void;
  contact: (m: Member) => void;
}) {
  const [tab, setTab] = useState("Payments");
  const day = today();
  const rows = data.members
    .filter((m) => !m.archived)
    .filter((m) => {
      const s = latest(data, m.id),
        log = data.reminders.filter((x) => x.memberId === m.id).at(-1);
      if (tab === "Payments") return balance(data, m.id) > 0;
      if (tab === "Renewals")
        return (
          !!s &&
          s.end <= shiftDay(day, 7) &&
          !data.memberships.some(
            (x) => x.memberId === m.id && !x.cancelled && x.start > day,
          )
        );
      if (tab === "Follow-ups") return !!log?.nextDate && log.nextDate <= day;
      const last = data.attendance
        .filter((a) => a.memberId === m.id)
        .at(-1)?.day;
      return (
        !!s &&
        s.end >= day &&
        (last ? last < shiftDay(day, -14) : m.joined < shiftDay(day, -14))
      );
    })
    .sort(
      (a, b) =>
        overdue(data, b.id) - overdue(data, a.id) ||
        balance(data, b.id) - balance(data, a.id),
    );
  return (
    <section className="panel attention-panel">
      <div className="panel-header">
        <div>
          <h2>Needs attention</h2>
          <p>Resolve the next task without hunting through records.</p>
        </div>
        <span className="badge">{rows.length} members</span>
      </div>
      <div
        className="attention-tabs"
        role="group"
        aria-label="Attention category"
      >
        {["Payments", "Renewals", "Follow-ups", "Absent 14+ days"].map((x) => (
          <button
            className={tab === x ? "selected" : ""}
            aria-pressed={tab === x}
            onClick={() => setTab(x)}
            key={x}
          >
            {x}
          </button>
        ))}
      </div>
      <div>
        {rows.slice(0, 6).map((m) => {
          const s = latest(data, m.id),
            logs = data.reminders.filter((x) => x.memberId === m.id),
            log = logs.at(-1);
          const detail =
            tab === "Payments"
              ? `${money(balance(data, m.id))} pending${overdue(data, m.id) > 0 ? ` · ${money(overdue(data, m.id))} overdue` : ""}`
              : tab === "Renewals"
                ? `Expiry ${date(s!.end)}`
                : tab === "Follow-ups"
                  ? `Follow up ${date(log!.nextDate!)} · ${log?.note || log?.kind}`
                  : `Last visit: ${data.attendance.filter((x) => x.memberId === m.id).at(-1)?.day ? date(data.attendance.filter((x) => x.memberId === m.id).at(-1)!.day) : "No attendance recorded"}`;
          return (
            <div className="attention-row" key={m.id}>
              <button className="attention-member" onClick={() => open(m)}>
                <strong>{m.name}</strong>
                <small>{detail}</small>
                <small>
                  {log ? `Last contact ${date(log.at)}` : "No contact logged"}
                </small>
              </button>
              <div className="attention-actions">
                {tab === "Payments" ? (
                  <button className="small-button" onClick={() => pay(m)}>
                    Collect
                  </button>
                ) : tab === "Renewals" ? (
                  <button className="small-button" onClick={() => renew(m)}>
                    Renew
                  </button>
                ) : null}
                <button className="small-button" onClick={() => contact(m)}>
                  Follow up
                </button>
              </div>
            </div>
          );
        })}
        {!rows.length && (
          <div className="empty">
            <p>No members need attention in this category.</p>
          </div>
        )}
        {rows.length > 6 && (
          <p className="helper attention-footer">
            Showing the first 6. Use Members or Reminders to review all records.
          </p>
        )}
      </div>
    </section>
  );
}

export function LifecycleForm({
  data,
  membership,
  kind,
}: {
  data: Data;
  membership: Membership;
  kind: string;
}) {
  const [start, setStart] = useState(
    membership.start > today() ? membership.start : today(),
  );
  const [end, setEnd] = useState(start);
  const [reason, setReason] = useState("");
  let preview = "";
  if (kind === "freeze") {
    try {
      const updated = freezeMembership(
        data,
        membership.id,
        start,
        end,
        reason.length >= 5 ? reason : "Preview only",
      );
      preview = `New expiry: ${date(updated.end)}. Access is paused during the selected dates.`;
    } catch (e) {
      preview = (e as Error).message;
    }
  }
  return (
    <>
      <div className="context-note">
        <CalendarDays />
        <span>
          <strong>{membership.planName}</strong>
          <br />
          {date(membership.start)} – {date(membership.end)} ·{" "}
          {money(outstanding(data, membership))} pending
        </span>
      </div>
      {kind === "dueDate" ? (
        <label>
          Payment due date
          <input
            name="dueDate"
            type="date"
            required
            defaultValue={membership.dueDate || membership.start}
          />
        </label>
      ) : (
        <>
          {kind === "freeze" && (
            <>
              <div className="form-grid">
                <label>
                  Freeze start
                  <input
                    type="date"
                    name="start"
                    value={start}
                    min={today()}
                    required
                    onChange={(e) => {
                      setStart(e.target.value);
                      if (end < e.target.value) setEnd(e.target.value);
                    }}
                  />
                </label>
                <label>
                  Freeze end
                  <input
                    type="date"
                    name="end"
                    value={end}
                    min={start}
                    max={membership.end}
                    required
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
              </div>
              <p className="helper">
                The expiry extends by the number of frozen calendar days,
                including both dates. A conflicting future renewal blocks the
                freeze.
              </p>
              <div className="context-note">{preview}</div>
            </>
          )}
          {kind === "resume" && (
            <p>
              Resume access today. Unused freeze days will be removed from the
              extended expiry.
            </p>
          )}
          {kind === "cancel" && (
            <p className="context-note">
              Cancellation stops access immediately. It keeps receipts and
              outstanding fees intact; it does not issue a refund or waive a
              charge.
            </p>
          )}
          <label>
            Reason
            <textarea
              name="reason"
              required
              minLength={5}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </>
      )}
    </>
  );
}

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
      data.memberships.some(
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
    (sum, m) => sum + balance(data, m.id),
    0,
  );

  const planTotals = new Map<string, { count: number; amount: number }>();
  for (const p of cur.payments) {
    const s = data.memberships.find((m) => m.id === p.membershipId);
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

  const member = (memberId: string) =>
    data.members.find((m) => m.id === memberId);
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
                  const s = data.memberships.find(
                    (m) => m.id === p.membershipId,
                  );
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
          {cur.joins.length === 0 ? (
            <p className="helper">No new members joined in this range.</p>
          ) : (
            cur.joins.map((m) => (
              <div className="list-item" key={m.id}>
                <div>
                  <strong>{m.name}</strong>
                  <small>{m.phone || "No phone on file"}</small>
                </div>
                <strong>{date(m.joined)}</strong>
              </div>
            ))
          )}
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
                    .filter((m) => balance(data, m.id) > 0)
                    .map((m) => [
                      m.name,
                      m.phone,
                      balance(data, m.id) / 100,
                      overdue(data, m.id) / 100,
                    ]),
                ])
              }
            >
              Export
            </button>
          </div>
          {data.members.filter((m) => balance(data, m.id) > 0).length === 0 ? (
            <p className="helper">No outstanding balances.</p>
          ) : (
            data.members
              .filter((m) => balance(data, m.id) > 0)
              .map((m) => (
                <div className="list-item" key={m.id}>
                  <div>
                    <strong>{m.name}</strong>
                    <small>{money(overdue(data, m.id))} overdue</small>
                  </div>
                  <strong>{money(balance(data, m.id))}</strong>
                </div>
              ))
          )}
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
