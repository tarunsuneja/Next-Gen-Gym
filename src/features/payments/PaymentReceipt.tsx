import { Download } from "lucide-react";
import { MemberAvatar as Avatar } from "../../MemberAvatar";
import {
  WhatsAppLink,
  welcomeMessage,
  receiptMessage,
} from "../../WhatsAppActions";
import { type Data, type Payment, date, money } from "../../domain";
export function PaymentReceipt({
  data,
  payment,
  newRegistration = false,
  canVoid,
  onVoid,
}: {
  data: Data;
  payment: Payment;
  newRegistration?: boolean;
  canVoid: boolean;
  onVoid: (payment: Payment) => void;
}) {
  const memberName = (id: string) =>
    data.members.find((m) => m.id === id)?.name || "Unknown member";
  return (
    <>
      <div className="print-receipt">
        <div className="receipt-brand">
          <img
            className="receipt-logo"
            src="/ngf-logo.jpg"
            alt="Next Generation Fitness logo"
          />
          <h2>{payment.gymName || data.gym.name}</h2>
          <p>{payment.gymAddress ?? data.gym.address}</p>
          <p>{payment.gymPhone ?? data.gym.phone}</p>
        </div>
        <div className="receipt-title">
          <h3>PAYMENT RECEIPT</h3>
          <strong>{payment.receipt}</strong>
        </div>
        {payment.voided && (
          <p className="error">VOIDED — {payment.voidReason}</p>
        )}
        <dl>
          <dt>Member</dt>
          <dd className="member-identity">
            <Avatar
              name={payment.memberName || memberName(payment.memberId)}
              photo={data.members.find((m) => m.id === payment.memberId)?.photo}
            />
            {payment.memberName || memberName(payment.memberId)}
          </dd>
          <dt>Date</dt>
          <dd>{date(payment.at)}</dd>
          <dt>Membership</dt>
          <dd>
            {
              data.memberships.find((m) => m.id === payment.membershipId)
                ?.planName
            }
          </dd>
          <dt>Payment method</dt>
          <dd>{payment.method}</dd>
          <dt>Reference</dt>
          <dd>{payment.reference || "—"}</dd>
        </dl>
        <div className="receipt-total">
          <span>Amount received</span>
          <strong>{money(payment.amount)}</strong>
        </div>
        <p className="receipt-thanks">Thank you. Keep showing up.</p>
      </div>
      <div className="form-actions no-print">
        {!payment.voided &&
          data.members.find((m) => m.id === payment.memberId) && (
            <>
              <WhatsAppLink
                phone={
                  data.members.find((m) => m.id === payment.memberId)!.phone
                }
                message={receiptMessage(data, payment)}
              >
                WhatsApp receipt
              </WhatsAppLink>
              {newRegistration && (
                <WhatsAppLink
                  phone={
                    data.members.find((m) => m.id === payment.memberId)!.phone
                  }
                  message={welcomeMessage(
                    data,
                    data.members.find((m) => m.id === payment.memberId)!,
                  )}
                >
                  Send welcome
                </WhatsAppLink>
              )}
            </>
          )}
        <button className="primary" onClick={() => window.print()}>
          <Download size={16} />
          Print / save PDF
        </button>
        {canVoid && !payment.voided && (
          <button className="danger-button" onClick={() => onVoid(payment)}>
            Void payment
          </button>
        )}
      </div>
    </>
  );
}
