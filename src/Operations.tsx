import {
  attentionCategories,
  attentionDescriptions,
  attentionGroups,
  type AttentionCategory,
} from "./features/dashboard/attention";
import { Paginated } from "./shared/Paginated";
import { buildWorkspaceIndex } from "./domain/workspaceIndex";
import { MemberAvatar } from "./MemberAvatar";
import { memo, useMemo, useState } from "react";
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
  actions?: { label: string; keywords?: string[]; run: () => void }[];
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
                [a.label, ...(a.keywords || [])].some((label) =>
                  label.toLowerCase().includes(q.trim().toLowerCase()),
                ),
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
              <MemberAvatar name={m.name} photo={m.photo} />
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
                  <MemberAvatar
                    name={
                      p.memberName ||
                      data.members.find((m) => m.id === p.memberId)?.name ||
                      "Former member"
                    }
                    photo={data.members.find((m) => m.id === p.memberId)?.photo}
                  />
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
              [a.label, ...(a.keywords || [])].some((label) =>
                label.toLowerCase().includes(q.trim().toLowerCase()),
              ),
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

export const AttentionQueue = memo(function AttentionQueue({
  data,
  open,
  pay,
  viewAll,
  day = today(),
}: {
  data: Data;
  day?: string;
  open: (m: Member) => void;
  pay: (m: Member) => void;
  viewAll: (category: string, ids: string[]) => void;
}) {
  const [tab, setTab] = useState<AttentionCategory>("Expiring memberships");
  const workspaceIndex = useMemo(() => buildWorkspaceIndex(data), [data]);
  const categories = attentionCategories;
  const groupedRows = useMemo(
    () => attentionGroups(data, day, workspaceIndex),
    [data, workspaceIndex, day],
  );
  const rowsFor = (category: AttentionCategory) =>
    groupedRows.get(category) ?? [];
  const rows = rowsFor(tab);
  return (
    <section className="panel attention-panel">
      <div className="panel-header">
        <h2>Needs attention</h2>
        <button
          className="text-button"
          disabled={!rows.length}
          onClick={() =>
            viewAll(
              tab,
              rows.map((m) => m.id),
            )
          }
          aria-label="View all members needing attention"
        >
          View all <ArrowUpRight size={14} />
        </button>
      </div>
      <div
        className="attention-tabs"
        role="group"
        aria-label="Attention category"
      >
        {categories.map((x) => (
          <button
            className={tab === x ? "selected" : ""}
            aria-pressed={tab === x}
            onClick={() => {
              setTab(x);
              document.getElementById("attention-results")?.scrollTo(0, 0);
            }}
            key={x}
          >
            {x}{" "}
            <span className="attention-tab-count">({rowsFor(x).length})</span>
          </button>
        ))}
      </div>
      <p className="helper attention-description" role="status">
        {attentionDescriptions[tab]}
      </p>
      <Paginated
        records={rows}
        label="attention"
        render={(visibleRows) => (
          <div
            id="attention-results"
            className="attention-results"
            role="region"
            aria-label={`${tab} members needing attention`}
            tabIndex={0}
          >
            {visibleRows.map((m) => {
              const s = workspaceIndex.latest(m.id);
              const detail = tab === "Members without a plan" ? "No membership plan assigned"
                : tab === "Expiring memberships" ? `${s!.end < day ? "Expired" : "Expires"} ${date(s!.end)}`
                : `Last visit: ${workspaceIndex.lastVisit.get(m.id)?.day ? date(workspaceIndex.lastVisit.get(m.id)!.day) : "No attendance recorded"}`;
              return (
                <div className="attention-row" key={m.id}>
                  <button
                    className="attention-member member-identity"
                    aria-label={`Open ${m.name}`}
                    onClick={() => open(m)}
                  >
                    <MemberAvatar name={m.name} photo={m.photo} />
                    <span className="member-identity-copy">
                      <strong>{m.name}</strong>
                      <small>{detail}</small>
                    </span>
                  </button>
                  <div className="attention-actions">
                    {tab !== "Absent 14+ days" && (
                      <button className="small-button" onClick={() => pay(m)}>
                        {tab === "Members without a plan" ? "Add membership" : "Collect payment"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {!rows.length && (
              <div className="empty">
                <p>
                  No members need attention in this category.
                </p>
              </div>
            )}
          </div>
        )}
      />
    </section>
  );
});

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

export { Reports } from "./features/reports/Reports";
