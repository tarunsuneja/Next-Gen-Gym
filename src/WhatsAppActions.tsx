import { MessageCircle } from "lucide-react";
import { balance, date, money, outstanding, type Data, type Member, type Payment } from "./domain";

export function whatsappUrl(phone: string, message: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = "91" + digits;
  if (!/^[1-9]\d{10,14}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
export function welcomeMessage(data: Data, member: Member) {
  const period = data.memberships.filter(s => s.memberId === member.id && !s.cancelled).sort((a,b)=>b.start.localeCompare(a.start))[0];
  return `Welcome to ${data.gym.name}, ${member.name}!\nYour registration is complete.${period ? `\nMembership: ${period.planName}\nValid: ${date(period.start)} to ${date(period.end)}` : ""}\nWe're happy to have you with us!`;
}
export function receiptMessage(data: Data, payment: Payment) {
  const member = data.members.find(m=>m.id===payment.memberId);
  const period = data.memberships.find(s=>s.id===payment.membershipId);
  return `Hello ${payment.memberName || member?.name || "member"},\n${payment.gymName || data.gym.name} has received your payment of ${money(payment.amount)}.\nReceipt: ${payment.receipt}\nDate: ${date(payment.at)}\nPayment method: ${payment.method}${payment.reference ? `\nReference: ${payment.reference}` : ""}${period ? `\nMembership: ${period.planName}\nValid: ${date(period.start)} to ${date(period.end)}` : ""}\nThank you!`;
}
export function dueMessage(data: Data, member: Member) {
  const periods=data.memberships.filter(s=>s.memberId===member.id && outstanding(data,s)>0);
  const due=periods.map(s=>s.dueDate || s.start).sort()[0];
  return `Hello ${member.name},\nA friendly reminder from ${data.gym.name}: your pending membership fee is ${money(balance(data,member.id))}.${due ? `\nDue date: ${date(due)}` : ""}\nPlease contact the gym to complete your payment. If you have already paid, please let us know. Thank you!`;
}
export function WhatsAppLink({phone,message,children="WhatsApp",className="small-button"}: {phone:string;message:string;children?:React.ReactNode;className?:string}) {
  const url=whatsappUrl(phone,message);
  return url ? <a className={className} href={url} target="_blank" rel="noopener noreferrer"><MessageCircle size={16}/>{children}</a> : <span className="muted">Valid mobile number required for WhatsApp</span>;
}
