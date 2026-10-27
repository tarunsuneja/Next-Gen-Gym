import type { Member, StaffRole } from "../domain";
export type PaymentMethod = "Cash" | "UPI" | "Card" | "Bank transfer";
export type PaymentInput = {
  amount: number;
  method: string;
  reference: string;
  requestId: string;
};
export type PurchaseInput = {
  memberId: string;
  planId: string;
  start: string;
  end: string;
  amount: number;
  baseAmount: number;
  discountType: string;
  discountValue: number;
  dueDate: string;
  deferPayment?: boolean;
  payment?: PaymentInput;
};
type Identified = { id: string };
type Reason = Identified & { reason: string };
export type CommandPayloads = {
  member: Partial<Member> & {
    name: string;
    phone: string;
    sharedPhone?: boolean;
    enrollment?: Omit<PurchaseInput, "memberId">;
  };
  memberDelete: Identified;
  membership: PurchaseInput;
  membershipEdit: Reason & {
    planName: string;
    start: string;
    end: string;
    dueDate: string;
    amount: number;
    baseAmount: number;
    discountType: string;
    discountValue: number;
  };
  membershipExpire: Reason & { endDate: string };
  payment: PaymentInput & { membershipId: string };
  void: Reason;
  attendance: { memberId: string; override?: string };
  checkout: Identified;
  attendanceRemove: Reason;
  reminder: {
    id?: string;
    memberId: string;
    kind: string;
    note: string;
    nextDate: string;
  };
  settings: { name: string; phone: string; address: string };
  plan: { id?: string; name: string; months: number; price: number };
  planDelete: Identified;
  staffAdd: { email: string; role: StaffRole };
  staffUpdate: Identified & { role: StaffRole; enabled: boolean };
  staffRemove: Identified;
  whatsappConfig: {
    phoneNumberId: string;
    wabaId: string;
    displayName: string;
    senderPhone: string;
    enabled: boolean;
    dailySendCap: number;
    quietStart: string;
    quietEnd: string;
  };
  whatsappTemplate: {
    id?: string;
    name: string;
    category: string;
    language: string;
    body: string;
    variables: string[];
    isActive: boolean;
  };
  whatsappTemplateDelete: Identified;
  reminderRule: {
    id?: string;
    name: string;
    offsetDays: number;
    templateName: string;
    audience: string;
    isActive: boolean;
  };
  reminderRuleDelete: Identified;
  whatsappSeed: Record<string, never>;
  export: { kind: string };
  freeze: Reason & { start: string; end: string; dueDate?: string };
  resume: Reason & { start?: string; end?: string; dueDate?: string };
  cancel: Reason & { start?: string; end?: string; dueDate?: string };
  dueDate: Reason & { start?: string; end?: string; dueDate: string };
};
export type Action = {
  [K in keyof CommandPayloads]: {
    type: K;
    payload: CommandPayloads[K];
    requestId?: string;
  };
}[keyof CommandPayloads];
export const isLifecycleAction = (
  value: string,
): value is "freeze" | "resume" | "cancel" | "dueDate" =>
  ["freeze", "resume", "cancel", "dueDate"].includes(value);
