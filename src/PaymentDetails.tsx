import { useState } from "react";
import { id, money } from "./domain";
export function PaymentDetails({ amount }: { amount: number }) {
  const [method, setMethod] = useState("Cash");
  const [requestId] = useState(id);
  return (
    <section className="checkout-payment">
      <h3>Payment received</h3>
      <input type="hidden" name="paymentRequestId" value={requestId} />
      {amount === 0 ? (
        <>
          <input type="hidden" name="method" value="Cash" />
          <p className="context-note">
            No payment due. This membership is complimentary.
          </p>
        </>
      ) : (
        <>
          <div className="form-grid">
            <label>
              Amount received (₹)
              <input
                name="receivedAmount"
                type="number"
                readOnly
                value={(amount / 100).toFixed(2)}
                aria-describedby="full-payment-note"
              />
            </label>
            <label>
              Payment method
              <select
                name="method"
                aria-label="Payment method"
                required
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option>Cash</option>
                <option>UPI</option>
                <option>Card</option>
                <option>Bank transfer</option>
              </select>
            </label>
          </div>
          <label>
            {method === "Cash"
              ? "Collection note (optional)"
              : "Transaction reference"}
            <input
              key={method}
              name="reference"
              required={method !== "Cash"}
              maxLength={150}
              autoComplete="off"
              placeholder={
                method === "Cash"
                  ? "Optional note"
                  : "UPI / card / bank transaction reference"
              }
            />
          </label>
          <p className="helper" id="full-payment-note">
            Full payment: {money(amount)}. Record only after receiving the
            money.
          </p>
        </>
      )}
    </section>
  );
}
