import { GYM_NAME } from "./branding";
export type Member = {
  id: string;
  name: string;
  phone: string;
  email: string;
  gender: string;
  address: string;
  height: string;
  weight: string;
  joined: string;
  archived: boolean;
  notes: string;
  whatsappConsent?: boolean;
  photo?: string;
  dob?: string;
  leftOn?: string;
};
export type Plan = { id: string; name: string; months: number; price: number };
export type Membership = {
  id: string;
  memberId: string;
  planName: string;
  start: string;
  end: string;
  amount: number;
  baseAmount?: number;
  discountType?: "fixed" | "percent";
  discountValue?: number;
  discount?: number;
  dueDate?: string;
  cancelled?: boolean;
  cancelReason?: string;
  freezeStart?: string;
  freezeEnd?: string;
  freezeReason?: string;
};
export type Payment = {
  requestId?: string;
  id: string;
  membershipId: string;
  memberId: string;
  amount: number;
  method: string;
  reference: string;
  at: string;
  receipt: string;
  voided: boolean;
  voidReason: string;
  gymName?: string;
  gymPhone?: string;
  gymAddress?: string;
  memberName?: string;
};
export type Attendance = {
  id: string;
  memberId: string;
  day: string;
  at: string;
  override: string;
  outAt?: string | null;
};
export type Reminder = {
  id: string;
  memberId: string;
  at: string;
  kind: string;
  note?: string;
  nextDate?: string;
};
export type WhatsAppConfig = {
  phoneNumberId: string;
  wabaId: string;
  displayName: string;
  senderPhone: string;
  enabled: boolean;
  dailySendCap: number;
  quietStart: string;
  quietEnd: string;
};
export type TemplateCategory = "utility" | "marketing" | "authentication";
export type ReminderAudience = "expiring" | "expired" | "has_dues" | "inactive";
export type WhatsAppTemplate = {
  id: string;
  name: string;
  category: TemplateCategory;
  language: string;
  body: string;
  variables: string[];
  status: string;
  isActive: boolean;
};
export type ReminderRule = {
  id: string;
  name: string;
  offsetDays: number;
  templateName: string;
  audience: ReminderAudience;
  isActive: boolean;
};
export type WhatsAppMessage = {
  id: string;
  memberId?: string | null;
  direction: "out" | "in";
  templateName: string;
  waMessageId?: string;
  phone: string;
  body: string;
  status: string;
  error?: string;
  at: string;
};
export type WhatsApp = {
  config: WhatsAppConfig;
  templates: WhatsAppTemplate[];
  rules: ReminderRule[];
  messages: WhatsAppMessage[];
};
export type StaffRole = "owner" | "reception";
export type Staff = {
  id: string;
  email: string;
  role: StaffRole;
  enabled: boolean;
  self?: boolean;
};
export type AuditEntry = {
  id: string;
  actor: string | null;
  action: string;
  payload: unknown;
  at: string;
};
export const emptyWhatsAppConfig = (): WhatsAppConfig => ({
  phoneNumberId: "",
  wabaId: "",
  displayName: "",
  senderPhone: "",
  enabled: false,
  dailySendCap: 200,
  quietStart: "21:00",
  quietEnd: "08:00",
});
export const defaultTemplates = (): WhatsAppTemplate[] =>
  [
    {
      name: "renewal_reminder",
      body: "Hi {{member_name}}, your {{plan_name}} membership expires on {{expiry_date}}. Renew to continue without interruption. - {{gym_name}}",
      variables: ["member_name", "plan_name", "expiry_date", "gym_name"],
    },
    {
      name: "fee_due_reminder",
      body: "Hi {{member_name}}, this is {{gym_name}}. Your membership fee balance is ₹{{outstanding}}, due on {{due_date}}. Please contact us at {{gym_phone}} to complete the payment.",
      variables: [
        "member_name",
        "gym_name",
        "outstanding",
        "due_date",
        "gym_phone",
      ],
    },
    {
      name: "expiry_today",
      body: "Hi {{member_name}}, your membership expires today ({{expiry_date}}). Visit the front desk to renew. - {{gym_name}}",
      variables: ["member_name", "expiry_date", "gym_name"],
    },
    {
      name: "payment_receipt",
      body: "Payment received. Member: {{member_name}}, Amount: ₹{{amount}}, Plan: {{plan_name}}. Thank you! - {{gym_name}}",
      variables: ["member_name", "amount", "plan_name", "gym_name"],
    },
    {
      name: "welcome_member",
      body: "Welcome to {{gym_name}}, {{member_name}}! Your membership is active until {{expiry_date}}. For help call {{gym_phone}}.",
      variables: ["gym_name", "member_name", "expiry_date", "gym_phone"],
    },
  ].map((t) => ({
    id: id(),
    name: t.name,
    category: "utility" as TemplateCategory,
    language: "en",
    body: t.body,
    variables: t.variables,
    status: "draft",
    isActive: true,
  }));
export const defaultRules = (): ReminderRule[] =>
  [
    {
      name: "Renewal in 3 days",
      offsetDays: -3,
      templateName: "renewal_reminder",
      audience: "expiring" as ReminderAudience,
    },
    {
      name: "Renewal in 1 day",
      offsetDays: -1,
      templateName: "renewal_reminder",
      audience: "expiring" as ReminderAudience,
    },
    {
      name: "Expires today",
      offsetDays: 0,
      templateName: "expiry_today",
      audience: "expiring" as ReminderAudience,
    },
    {
      name: "Fee overdue 1 day",
      offsetDays: 1,
      templateName: "fee_due_reminder",
      audience: "has_dues" as ReminderAudience,
    },
    {
      name: "Expired 7 days ago",
      offsetDays: 7,
      templateName: "renewal_reminder",
      audience: "expired" as ReminderAudience,
    },
  ].map((r) => ({ id: id(), isActive: true, ...r }));
export const WA_VARIABLES = [
  "member_name",
  "gym_name",
  "plan_name",
  "expiry_date",
  "due_date",
  "amount",
  "outstanding",
  "days_left",
  "gym_phone",
  "gym_address",
] as const;
export type Data = {
  requests?: Record<string, { type: string; payload: string }>;
  members: Member[];
  plans: Plan[];
  memberships: Membership[];
  payments: Payment[];
  attendance: Attendance[];
  reminders: Reminder[];
  whatsapp?: WhatsApp;
  staff?: Staff[];
  audit?: AuditEntry[];
  gym: { name: string; phone: string; address: string };
};
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
// randomUUID is restricted to secure contexts; local Wi-Fi HTTP previews are not.
export function id() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 ? 2 : 0,
  }).format(paise / 100);
export const date = (s: string) =>
  new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
export function shiftDay(s: string, n: number) {
  const d = new Date(s + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function expiry(start: string, months: number) {
  const d = new Date(start + "T12:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return shiftDay(d.toISOString().slice(0, 10), -1);
}
export const outstanding = (d: Data, m: Membership) =>
  Math.max(
    0,
    m.amount -
      d.payments
        .filter((p) => p.membershipId === m.id && !p.voided)
        .reduce((a, p) => a + p.amount, 0),
  );
export const balance = (d: Data, memberId: string) =>
  d.memberships
    .filter((m) => m.memberId === memberId)
    .reduce((a, m) => a + outstanding(d, m), 0);
export const active = (d: Data, m: Member) =>
  !m.archived &&
  d.memberships.some(
    (s) =>
      s.memberId === m.id &&
      s.start <= today() &&
      s.end >= today() &&
      !s.cancelled &&
      !frozen(s),
  );
export const latest = (d: Data, memberId: string) =>
  d.memberships
    .filter((m) => m.memberId === memberId && !m.cancelled)
    .sort((a, b) => b.end.localeCompare(a.end))[0];
export function waVariables(
  d: Data,
  memberId: string,
  runDay = today(),
): Record<string, string> {
  const m = d.members.find((x) => x.id === memberId);
  if (!m) return {};
  const lm = latest(d, memberId);
  const totalDue = d.memberships
    .filter((s) => s.memberId === memberId && !s.cancelled)
    .reduce((a, s) => a + outstanding(d, s), 0);
  return {
    member_name: m.name,
    phone: m.phone,
    gym_name: d.gym.name,
    gym_phone: d.gym.phone,
    gym_address: d.gym.address,
    plan_name: lm?.planName ?? "",
    expiry_date: lm ? date(lm.end) : "",
    due_date: lm?.dueDate ? date(lm.dueDate) : "",
    amount: lm ? String(Math.round(lm.amount / 100)) : "0",
    outstanding: String(Math.round(totalDue / 100)),
    days_left: lm
      ? String(
          Math.max(
            0,
            Math.round((Date.parse(lm.end) - Date.parse(runDay)) / 86400000),
          ),
        )
      : "0",
  };
}
export const renderTemplate = (body: string, vars: Record<string, string>) =>
  body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
export function dueReminders(
  d: Data,
  runDay = today(),
): {
  memberId: string;
  templateName: string;
  template: WhatsAppTemplate;
  body: string;
}[] {
  const wa = d.whatsapp;
  if (!wa || !wa.config.enabled) return [];
  const out: {
    memberId: string;
    templateName: string;
    template: WhatsAppTemplate;
    body: string;
  }[] = [];
  for (const rule of wa.rules.filter((r) => r.isActive)) {
    if (
      rule.audience !== "expiring" &&
      rule.audience !== "expired" &&
      rule.audience !== "has_dues"
    )
      continue;
    const target = shiftDay(runDay, -rule.offsetDays);
    for (const m of d.members) {
      if (m.archived || !m.whatsappConsent) continue;
      const lm = latest(d, m.id);
      if (!lm) continue;
      if (rule.audience === "has_dues") {
        if (lm.dueDate !== target || outstanding(d, lm) <= 0) continue;
      } else if (lm.end !== target) continue;
      const template = wa.templates.find(
        (t) => t.name === rule.templateName && t.isActive,
      );
      if (!template) continue;
      if (
        wa.messages.some(
          (msg) =>
            msg.direction === "out" &&
            msg.memberId === m.id &&
            msg.templateName === rule.templateName &&
            localDay(msg.at) === runDay,
        )
      )
        continue;
      const body = renderTemplate(template.body, waVariables(d, m.id, runDay));
      if (
        out.some(
          (x) => x.memberId === m.id && x.templateName === rule.templateName,
        )
      )
        continue;
      out.push({
        memberId: m.id,
        templateName: rule.templateName,
        template,
        body,
      });
    }
  }
  return out;
}
export function validatePayment(d: Data, membershipId: string, amount: number) {
  const m = d.memberships.find((x) => x.id === membershipId);
  if (!m) throw Error("Choose a membership.");
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw Error("Enter a valid payment amount.");
  if (amount > outstanding(d, m))
    throw Error("Payment exceeds the pending balance.");
}
export function normalizePhone(value: string) {
  const trimmed = value.trim();
  if (!/^[+\d\s()-]+$/.test(trimmed)) return "";
  const digits = trimmed.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits;
}
export function memberErrors(
  d: Data,
  p: Record<string, unknown>,
  memberId?: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if(p.dob && (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.dob)) || !Number.isFinite(Date.parse(String(p.dob))) || new Date(String(p.dob)).toISOString().slice(0,10)!==p.dob || String(p.dob)>today())) errors.dob="Choose a valid date of birth that is not in the future.";
  const name = String(p.name || "").trim(),
    phone = normalizePhone(String(p.phone || "")),
    email = String(p.email || "").trim();
  if (!name || name.length > 100)
    errors.name = "Enter a full name between 1 and 100 characters.";
  if (!/^\d{10,15}$/.test(phone) || /^0+$/.test(phone))
    errors.phone =
      "Enter a valid mobile number (10–15 digits). Spaces and country codes are supported.";
  else if (
    (!memberId ||
      normalizePhone(d.members.find((m) => m.id === memberId)?.phone || "") !==
        phone) &&
    d.members.some(
      (m) => m.id !== memberId && normalizePhone(m.phone) === phone,
    ) &&
    !p.sharedPhone
  )
    errors.phone =
      "This phone belongs to another member. Confirm the shared family number below or use a different phone.";
  if (
    email &&
    (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  )
    errors.email = "Enter a valid email address or leave it blank.";
  if (p.gender && !["Male", "Female"].includes(String(p.gender)))
    errors.gender = "Gender must be Male or Female.";
  for (const [key, min, max, unit] of [
    ["height", 50, 300, "cm"],
    ["weight", 10, 500, "kg"],
  ] as const) {
    const value = String(p[key] || "").trim();
    if (
      value &&
      (!/^\d+(\.\d)?$/.test(value) ||
        Number(value) < min ||
        Number(value) > max)
    )
      errors[key] =
        `Enter ${key} between ${min} and ${max} ${unit}, with at most one decimal place.`;
  }
  return errors;
}
export const frozen = (s: Membership, day = today()) =>
  !!s.freezeStart &&
  !!s.freezeEnd &&
  s.freezeStart <= day &&
  s.freezeEnd >= day;
export const membershipStatus = (s: Membership, day = today()) =>
  s.cancelled
    ? "Cancelled"
    : frozen(s, day)
      ? "Frozen"
      : s.start > day
        ? "Upcoming"
        : s.end < day
          ? "Expired"
          : "Current";
export const overdue = (d: Data, memberId: string, day = today()) =>
  d.memberships
    .filter((s) => s.memberId === memberId && !!s.dueDate && s.dueDate < day)
    .reduce((sum, s) => sum + outstanding(d, s), 0);
export const localDay = (timestamp: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
export function freezeMembership(
  d: Data,
  membershipId: string,
  start: string,
  end: string,
  reason: string,
) {
  const s = d.memberships.find((s) => s.id === membershipId);
  if (!s || s.cancelled) throw Error("Available membership required.");
  if (reason.trim().length < 5)
    throw Error("Provide a reason of at least five characters.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    start < today() ||
    end < start ||
    start < s.start ||
    end > s.end
  )
    throw Error(
      "Freeze dates must be within the membership and cannot start in the past.",
    );
  if (s.freezeEnd && s.freezeEnd >= today())
    throw Error("Resume the existing freeze before scheduling another.");
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  const extended = shiftDay(s.end, days);
  if (
    d.memberships.some(
      (x) =>
        x.id !== s.id &&
        x.memberId === s.memberId &&
        !x.cancelled &&
        x.start <= extended &&
        x.end >= s.start,
    )
  )
    throw Error(
      "The extension overlaps another membership. Adjust the future renewal first.",
    );
  return {
    ...s,
    end: extended,
    freezeStart: start,
    freezeEnd: end,
    freezeReason: reason.trim(),
  };
}
export function seed(): Data {
  const names = [
    "Arjun Mehta",
    "Priya Sharma",
    "Rohan Kapoor",
    "Sneha Patel",
    "Vikram Singh",
    "Ananya Rao",
    "Kabir Shah",
    "Meera Nair",
  ];
  const t = today();
  const members = names.map((name, i) => ({
    id: id(),
    name,
    phone: "90000000" + String(i + 10),
    email: "",
    gender: i % 2 ? "Female" : "Male",
    address: i % 3 === 2 ? "" : `Flat ${i + 1}, Park Street, Bengaluru`,
    height: i % 4 === 3 ? "" : String(155 + i * 4),
    weight: i % 4 === 3 ? "" : String(52 + i * 5),
    joined: shiftDay(t, -40 - i * 3),
    archived: false,
    notes: "",
    whatsappConsent: i !== 7,
  }));
  const plans = [
    { id: id(), name: "Monthly", months: 1, price: 150000 },
    { id: id(), name: "Quarterly", months: 3, price: 400000 },
    { id: id(), name: "Annual", months: 12, price: 1400000 },
  ];
  const memberships = members.map((m, i) => ({
    id: id(),
    memberId: m.id,
    planName: i % 2 ? "Quarterly" : "Monthly",
    start: shiftDay(t, -20),
    end: shiftDay(t, i === 4 ? -3 : i === 1 ? 3 : i === 5 ? 6 : 20 + i * 4),
    amount: i % 2 ? 400000 : 150000,
    dueDate: shiftDay(t, -10),
  }));
  const payments = memberships.map((m, i) => ({
    id: id(),
    membershipId: m.id,
    memberId: m.memberId,
    amount: i === 2 ? 50000 : i === 5 ? 200000 : m.amount,
    method: i % 2 ? "UPI" : "Cash",
    reference: "",
    at: new Date(Date.now() - i * 86400000).toISOString(),
    receipt: "DEMO-" + String(i + 1).padStart(4, "0"),
    voided: false,
    voidReason: "",
  }));
  return {
    members,
    plans,
    memberships,
    payments,
    attendance: members.slice(0, 3).map((m) => ({
      id: id(),
      memberId: m.id,
      day: t,
      at: new Date().toISOString(),
      override: "",
    })),
    reminders: [],
    whatsapp: {
      config: emptyWhatsAppConfig(),
      templates: defaultTemplates(),
      rules: defaultRules(),
      messages: [],
    },
    staff: [
      {
        id: id(),
        email: "owner@demo.local",
        role: "owner",
        enabled: true,
        self: true,
      },
      {
        id: id(),
        email: "reception@demo.local",
        role: "reception",
        enabled: true,
      },
    ],
    audit: [],
    gym: { name: GYM_NAME, phone: "", address: "" },
  };
}
