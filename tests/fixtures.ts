import { GYM_NAME } from "../src/branding.ts";
import {
  type Data,
  id,
  today,
  shiftDay,
  emptyWhatsAppConfig,
  defaultTemplates,
  defaultRules,
} from "../src/domain.ts";
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
    { id: id(), name: "Basic Package", months: 1, price: 120000 },
    { id: id(), name: "Standard Package", months: 3, price: 300000 },
    { id: id(), name: "Premium Package", months: 6, price: 550000 },
    { id: id(), name: "Ultimate Package", months: 12, price: 1020000 },
  ];
  const memberships = members.map((m, i) => ({
    id: id(),
    memberId: m.id,
    planName: i % 2 ? "Standard Package" : "Basic Package",
    start: shiftDay(t, -20),
    end: shiftDay(t, i === 4 ? -3 : i === 1 ? 3 : i === 5 ? 6 : 20 + i * 4),
    amount: i % 2 ? 300000 : 120000,
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
    receipt: "SAMPLE-" + String(i + 1).padStart(4, "0"),
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

/** Independent JS oracle for SQL dashboard projection parity tests. */
export function dashboardFixture(source: Data, day = today()): Data {
  const data = structuredClone(source);
  const dayOf = (at: string) =>
    new Date(Date.parse(at) + 19800000).toISOString().slice(0, 10);
  const paid: Record<string, number> = {};
  const payments = new Map<
    string,
    { day: string; amount: number; count: number }
  >();
  const visits = new Map<string, { day: string; count: number }>();
  const hours = new Map<number, { hour: number; amount: number }>();
  for (const p of source.payments) {
    if (p.voided) continue;
    paid[p.membershipId] = (paid[p.membershipId] ?? 0) + p.amount;
    const at = dayOf(p.at);
    if (at >= shiftDay(day, -62) && at <= day) {
      const row = payments.get(at) ?? { day: at, amount: 0, count: 0 };
      row.amount += p.amount;
      row.count++;
      payments.set(at, row);
    }
    if (at === day) {
      const hour = new Date(Date.parse(p.at) + 19800000).getUTCHours();
      const row = hours.get(hour) ?? { hour, amount: 0 };
      row.amount += p.amount;
      hours.set(hour, row);
    }
  }
  const last = new Map<string, Data["attendance"][number]>();
  for (const a of [...source.attendance].sort(
    (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
  )) {
    last.set(a.memberId, a);
    if (a.day >= shiftDay(day, -62) && a.day <= day) {
      const row = visits.get(a.day) ?? { day: a.day, count: 0 };
      row.count++;
      visits.set(a.day, row);
    }
  }
  data.payments = source.payments
    .filter((p) => !p.voided)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
    .slice(-5);
  data.attendance = source.attendance.filter(
    (a) => a.day === day || last.get(a.memberId)?.id === a.id,
  );
  data.reminders = [];
  data.staff = [];
  data.audit = [];
  data.dashboard = {
    day,
    paid,
    paymentDays: [...payments.values()].sort((a, b) =>
      a.day.localeCompare(b.day),
    ),
    visitDays: [...visits.values()].sort((a, b) => a.day.localeCompare(b.day)),
    hours: [...hours.values()].sort((a, b) => a.hour - b.hour),
  };
  return data;
}
