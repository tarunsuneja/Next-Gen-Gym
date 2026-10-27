import { PaymentDetails } from "./PaymentDetails";
import { useState } from "react";
import { Users, CalendarDays, CheckCircle2 } from "lucide-react";
import { MemberPhoto } from "./MemberPhoto";
import { discountTotal } from "./MembershipPricing";
import { type Data, type Member, today, expiry, date, money } from "./domain";

export function MemberRegistration({
  data,
  member,
  busy,
}: {
  data: Data;
  member?: Member;
  busy: boolean;
}) {
  const t = today();
  const [planId, setPlanId] = useState(data.plans[0]?.id || "");
  const [enroll, setEnroll] = useState(data.plans.length > 0);
  const [start, setStart] = useState(t);
  const [paymentTiming, setPaymentTiming] = useState("received");
  const [dueDate, setDueDate] = useState(t);
  const [base, setBase] = useState((data.plans[0]?.price || 0) / 100);
  const [discountType, setDiscountType] = useState("fixed");
  const [discountValue, setDiscountValue] = useState(0);
  const plan = data.plans.find((p) => p.id === planId);
  let total = 0,
    pricingError = "";
  try {
    total = discountTotal(
      Math.round(base * 100),
      discountType,
      discountValue,
    ).amount;
  } catch (e) {
    pricingError = (e as Error).message;
  }
  const end = start && plan ? expiry(start, plan.months) : "";
  const basic = (
    <>
      <MemberPhoto initial={member?.photo} disabled={busy} />
      <div className="form-grid">
        <div className="form-section-title">
          <Users size={16} />
          Contact details
        </div>
        <label className="member-name-field">
          Full name
          <input
            name="name"
            required
            maxLength={100}
            defaultValue={member?.name}
            autoFocus
            autoComplete="name"
          />
        </label>
        <label>
          Phone number
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={25}
            required
            defaultValue={member?.phone}
            placeholder="10-digit mobile number"
          />
        </label>
      </div>
      <label>
        Joining date
        <input
          name="joined"
          type="date"
          required
          max={t}
          defaultValue={member?.joined || t}
        />
      </label>
      <label>
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          defaultValue={member?.email}
        />
      </label>
      <label>
        Date of birth
        <input
          type="date"
          name="dob"
          max={t}
          defaultValue={member?.dob || ""}
        />
      </label>
      <section className="member-details-fields">
        <div className="form-section-title">Additional details</div>
        <div className="form-grid">
          <label>
            Gender
            <select name="gender" defaultValue={member?.gender || ""}>
              <option value="">Select gender</option>
              <option>Male</option>
              <option>Female</option>
            </select>
          </label>
          <label>
            Address <span className="optional">optional</span>
            <input
              name="address"
              maxLength={200}
              defaultValue={member?.address}
              placeholder="House, street, city"
            />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Height (cm)
            <input
              name="height"
              type="number"
              min={50}
              max={300}
              step="0.1"
              defaultValue={member?.height}
              placeholder="e.g. 172"
            />
          </label>
          <label>
            Weight (kg)
            <input
              name="weight"
              type="number"
              min={10}
              max={500}
              step="0.1"
              defaultValue={member?.weight}
              placeholder="e.g. 68"
            />
          </label>
        </div>
        <label>
          Notes <span className="optional">optional</span>
          <textarea
            name="notes"
            maxLength={1000}
            defaultValue={member?.notes}
          />
        </label>
      </section>
    </>
  );
  if (member) return basic;
  return (
    <div className="registration-layout">
      <div className="registration-main">
        <section className="registration-card registration-basic">
          <h3>
            <Users size={18} /> Basic information
          </h3>
          {basic}
        </section>
        <section className="registration-card">
          <div className="registration-section-heading">
            <h3>
              <CalendarDays size={18} /> Membership details
            </h3>
            <label className="checkbox">
              <input
                type="checkbox"
                name="addMembership"
                checked={enroll}
                disabled={!data.plans.length}
                onChange={(e) => setEnroll(e.target.checked)}
              />
              Add membership
            </label>
          </div>
          {!data.plans.length && (
            <p className="helper">
              Create a plan in Settings to add a membership. You can save this
              member now.
            </p>
          )}
          {enroll && (
            <>
              <div className="form-grid">
                <label>
                  Membership plan
                  <select
                    aria-label="Membership plan"
                    name="plan"
                    required
                    value={planId}
                    onChange={(e) => {
                      setPlanId(e.target.value);
                      setBase(
                        (data.plans.find((p) => p.id === e.target.value)
                          ?.price || 0) / 100,
                      );
                    }}
                  >
                    {data.plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
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
                    aria-label="Expiry date"
                    type="date"
                    readOnly
                    value={end}
                  />
                </label>
                <label>
                  Fee (₹)
                  <input
                    name="baseAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={base}
                    onChange={(e) => setBase(Number(e.target.value))}
                  />
                </label>
                <label>
                  Discount type
                  <select
                    aria-label="Discount type"
                    name="discountType"
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value)}
                  >
                    <option value="fixed">Amount (₹)</option>
                    <option value="percent">Percentage (%)</option>
                  </select>
                </label>
                <label>
                  Discount
                  <input
                    name="discountValue"
                    type="number"
                    min="0"
                    max={discountType === "percent" ? 100 : base}
                    step="0.01"
                    required
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                  />
                </label>
              </div>
              <input type="hidden" name="amount" value={total / 100} />
              {pricingError && (
                <p className="error" role="alert">
                  {pricingError}
                </p>
              )}
              {total > 0 && (
                <div className="form-grid">
                  <label>
                    Payment status
                    <select
                      aria-label="Payment status"
                      name="paymentTiming"
                      value={paymentTiming}
                      onChange={(e) => setPaymentTiming(e.target.value)}
                    >
                      <option value="received">Payment received</option>
                      <option value="later">Pay later</option>
                    </select>
                  </label>
                  {paymentTiming === "later" && (
                    <label>
                      Payment due date
                      <input
                        name="dueDate"
                        type="date"
                        required
                        min={t}
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                    </label>
                  )}
                </div>
              )}
              {total > 0 && paymentTiming === "later" ? (
                <p className="context-note" role="status">
                  {money(total)} pending. Collect the full fee later from Fees
                  &amp; receipts. No receipt is issued until payment is
                  received.
                </p>
              ) : (
                <>
                  <input name="dueDate" type="hidden" value={start} />
                  <PaymentDetails amount={total} />
                </>
              )}
            </>
          )}
        </section>
      </div>
      <aside
        className="registration-card registration-summary"
        aria-label="Selected plan summary"
      >
        <h3>
          <CalendarDays size={18} /> Selected plan summary
        </h3>
        {enroll && plan ? (
          <>
            <div className="registration-status">
              <CheckCircle2 size={18} />
              <span>
                {start && end
                  ? `${date(start)} – ${date(end)}`
                  : "Select a start date"}
              </span>
            </div>
            <h4>{plan.name}</h4>
            <dl>
              <div>
                <dt>Duration</dt>
                <dd>
                  {plan.months} month{plan.months === 1 ? "" : "s"}
                </dd>
              </div>
              <div>
                <dt>Membership fee</dt>
                <dd>{money(Math.round(base * 100))}</dd>
              </div>
              <div>
                <dt>Discount</dt>
                <dd>
                  {pricingError ? "—" : money(Math.round(base * 100) - total)}
                </dd>
              </div>
              <div className="registration-total">
                <dt>Total payable</dt>
                <dd>{pricingError ? "—" : money(total)}</dd>
              </div>
            </dl>
            <p className="helper">
              {total > 0 && paymentTiming === "later"
                ? `Payment pending · Due ${date(dueDate)}`
                : total === 0
                  ? "Complimentary membership. Access starts on the selected start date."
                  : "Payment is recorded today. Access starts on the selected start date."}
            </p>
          </>
        ) : (
          <p className="helper">
            Save the member now and add a membership later.
          </p>
        )}
      </aside>
    </div>
  );
}
