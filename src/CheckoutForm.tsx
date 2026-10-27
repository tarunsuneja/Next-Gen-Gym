import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import {
  type Data,
  type Member,
  today,
  latest,
  shiftDay,
  expiry,
  date,
  money,
  outstanding,
  id,
  balance,
} from "./domain";
import { MemberAvatar } from "./MemberAvatar";
import { MembershipPricing } from "./MembershipPricing";
import { PaymentDetails } from "./PaymentDetails";
function PurchaseFields({ data, member }: { data: Data; member: Member }) {
  const previous = latest(data, member.id);
  const first =
    data.plans.find((p) => p.name === previous?.planName) || data.plans[0];
  const [planId, setPlanId] = useState(first?.id || "");
  const [start, setStart] = useState(
    previous && previous.end >= today() ? shiftDay(previous.end, 1) : today(),
  );
  const [base, setBase] = useState((first?.price || 0) / 100);
  const [total, setTotal] = useState(first?.price || 0);
  const plan = data.plans.find((p) => p.id === planId);
  if (member.archived)
    return (
      <p className="error">
        Restore this member before purchasing a membership.
      </p>
    );
  if (!plan)
    return <p className="error">Create a membership plan in Settings first.</p>;
  return (
    <div className="checkout-sale-grid">
      <section className="checkout-membership-fields">
        <h3>Membership details</h3>
        <div className="form-grid">
          <label>
            Membership plan
            <select
              name="plan"
              aria-label="Membership plan"
              required
              value={planId}
              onChange={(e) => {
                setPlanId(e.target.value);
                setBase(
                  (data.plans.find((p) => p.id === e.target.value)?.price ||
                    0) / 100,
                );
              }}
            >
              {data.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {money(p.price)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start date
            <input
              name="start"
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Expiry date
            <input
              type="date"
              aria-label="Expiry date"
              readOnly
              value={start ? expiry(start, plan.months) : ""}
            />
          </label>
        </div>
        <input name="dueDate" type="hidden" value={start} />
        {previous && (
          <p className="helper">
            Previous membership ends {date(previous.end)}. The next available
            start date is suggested.
          </p>
        )}
        <MembershipPricing base={base} onBase={setBase} onTotal={setTotal} />
      </section>
      <PaymentDetails amount={total} />
    </div>
  );
}
function BalanceFields({ data, member }: { data: Data; member: Member }) {
  const unpaid = data.memberships
    .filter((s) => s.memberId === member.id && outstanding(data, s) > 0)
    .sort((a, b) => (a.dueDate || a.start).localeCompare(b.dueDate || b.start));
  const [selected, setSelected] = useState(unpaid[0]?.id || "");
  const period = unpaid.find((s) => s.id === selected);
  if (!period)
    return (
      <p className="context-note">
        No payment is due. Existing memberships are already paid.
      </p>
    );
  const amount = outstanding(data, period);
  return (
    <>
      <label>
        Outstanding membership
        <select
          name="membershipId"
          aria-label="Outstanding membership"
          required
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {unpaid.map((s) => (
            <option key={s.id} value={s.id}>
              {s.planName} · {s.start} – {s.end} · {money(outstanding(data, s))}
            </option>
          ))}
        </select>
      </label>
      <input type="hidden" name="amount" value={amount / 100} />
      <p className="helper">
        This settles the full remaining balance. Previous receipts stay
        unchanged.
      </p>
      <PaymentDetails amount={amount} />
    </>
  );
}
export function CheckoutForm({
  data,
  member,
  onReadyChange,
}: {
  data: Data;
  member?: Member;
  onReadyChange?: (ready: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [memberId, setMemberId] = useState(member?.id || "");
  const [mode, setMode] = useState<"purchase" | "balance">(
    member &&
      !data.memberships.some((s) => s.memberId === member.id && !s.cancelled)
      ? "purchase"
      : "balance",
  );
  const [purchaseConfirmed, setPurchaseConfirmed] = useState(false);
  const [requestId] = useState(id);
  const selected = data.members.find((m) => m.id === memberId);
  const hasMembership =
    !!selected &&
    data.memberships.some((s) => s.memberId === selected.id && !s.cancelled);
  const pendingAmount = selected ? balance(data, selected.id) : 0;
  const previous = selected ? latest(data, selected.id) : undefined;
  const canExtend =
    !selected?.archived &&
    pendingAmount === 0 &&
    (!previous || previous.end <= shiftDay(today(), 7));
  const ready =
    !!selected &&
    (mode === "balance"
      ? balance(data, selected.id) > 0
      : canExtend &&
        !selected.archived &&
        data.plans.length > 0 &&
        (!hasMembership || purchaseConfirmed));
  useEffect(() => {
    onReadyChange?.(ready);
    return () => onReadyChange?.(false);
  }, [ready, onReadyChange]);
  const term = query.trim().toLowerCase();
  const results = term
    ? data.members
        .filter(
          (m) =>
            (!m.archived || balance(data, m.id) > 0) &&
            `${m.name} ${m.phone} ${m.id}`.toLowerCase().includes(term),
        )
        .slice(0, 8)
    : [];
  return (
    <div className="checkout-form">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="checkoutMode" value={mode} />
      <input
        type="hidden"
        name="purchaseIntent"
        value={purchaseConfirmed ? "renewal" : "initial"}
      />
      <h3>1. Select member</h3>
      {!selected ? (
        <>
          <label>
            Search member
            <div className="checkout-search">
              <Search size={18} />
              <input
                type="search"
                aria-label="Search member"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, phone number or member ID"
                autoComplete="off"
                autoFocus
              />
            </div>
          </label>
          <div className="checkout-results">
            {results.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => {
                  setMemberId(m.id);
                  setQuery("");
                  setMode(
                    m.archived ||
                      balance(data, m.id) > 0 ||
                      data.memberships.some(
                        (s) => s.memberId === m.id && !s.cancelled,
                      )
                      ? "balance"
                      : "purchase",
                  );
                  setPurchaseConfirmed(false);
                }}
              >
                <MemberAvatar name={m.name} photo={m.photo} />
                <span>
                  <strong>{m.name}</strong>
                  <small>
                    {m.phone}
                    {m.archived ? " · Archived" : ""}
                  </small>
                </span>
              </button>
            ))}
            {term && !results.length && (
              <p className="helper">No matching members found.</p>
            )}
          </div>
          <p className="helper">
            Select a member to see plans and payment details.
          </p>
        </>
      ) : (
        <>
          <div className="selected-checkout-member">
            <MemberAvatar name={selected.name} photo={selected.photo} />
            <span>
              <strong>{selected.name}</strong>
              <small>{selected.phone}</small>
              {balance(data, selected.id) > 0 && (
                <small>
                  Pending fee: {money(pendingAmount)}. Collect this existing fee
                  before renewing.
                </small>
              )}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Change selected member"
              onClick={() => setMemberId("")}
            >
              <X size={17} />
            </button>
          </div>
          <div
            className="tabs checkout-tabs"
            role="group"
            aria-label="Payment purpose"
          >
            {(pendingAmount > 0 || canExtend) && (
              <button
                type="button"
                aria-pressed={mode === "purchase"}
                disabled={!canExtend}
                className={mode === "purchase" ? "active" : ""}
                onClick={() => {
                  setMode("purchase");
                  setPurchaseConfirmed(true);
                }}
              >
                {hasMembership ? "Extend membership" : "Add membership"}
              </button>
            )}
            <button
              type="button"
              aria-pressed={mode === "balance"}
              className={mode === "balance" ? "active" : ""}
              onClick={() => setMode("balance")}
            >
              Collect pending fee
            </button>
          </div>
          {mode === "purchase" ? (
            <PurchaseFields key={selected.id} data={data} member={selected} />
          ) : (
            <BalanceFields key={selected.id} data={data} member={selected} />
          )}
          {mode === "balance" && pendingAmount === 0 && previous && (
            <p className="helper">
              Membership ends {date(previous.end)}.{" "}
              {canExtend
                ? "Choose Extend membership to review the new dates and fee."
                : `Extension becomes available ${date(shiftDay(previous.end, -7))}, seven days before expiry.`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
