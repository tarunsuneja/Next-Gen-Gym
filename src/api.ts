import { discountTotal } from "./MembershipPricing";
import { GYM_NAME } from "./branding";
import { createClient } from "@supabase/supabase-js";
import {
  type Data,
  type WhatsApp,
  seed,
  id,
  today,
  active,
  validatePayment,
  type Payment,
  freezeMembership,
  shiftDay,
  memberErrors,
  WA_VARIABLES,
  normalizePhone,
  defaultTemplates,
  defaultRules,
  emptyWhatsAppConfig,
  renderTemplate,
  waVariables,
} from "./domain";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;
export const isShowcase = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "sample";
export const DEMO_KEY = isShowcase ? "ngf-showcase-v1" : "gymdesk-demo-v1";
const KEY = DEMO_KEY;
export function demoLoad(): Data {
  try {
    const s = localStorage.getItem(KEY);
    if (s) {
      const data: Data = JSON.parse(s);
      if (data.gym.name === "Your Gym") {
        data.gym.name = GYM_NAME;
        localStorage.setItem(KEY, JSON.stringify(data));
      }
      for (const m of data.members) {
        m.gender = m.gender || "";
        m.address = m.address || "";
        m.height = m.height || "";
        m.weight = m.weight || "";
      }
      data.whatsapp ??= emptyWhatsApp();
      return data;
    }
  } catch {}
  const fresh = seed();
  if(isShowcase) {
    const t=today(),first=t.slice(0,7)+"-01";
    fresh.members.slice(0,3).forEach(m=>{m.joined=first;});
    fresh.members.slice(0,2).forEach((m,i)=>{m.dob=(i ? "1997" : "1994")+t.slice(4);});
    const left=fresh.members[fresh.members.length-1];left.archived=true;left.leftOn=t;
    const discounted=fresh.memberships[2];discounted.baseAmount=150000;discounted.discountType="percent";discounted.discountValue=10;discounted.discount=15000;discounted.amount=135000;
  }
  return fresh;
}
export function demoSave(data: Data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    throw Error(
      "This browser cannot save demo records. Allow site storage or leave private browsing, then try again.",
    );
  }
}
const emptyWhatsApp = (): WhatsApp => ({
  config: emptyWhatsAppConfig(),
  templates: [],
  rules: [],
  messages: [],
});
export async function sendWhatsApp(payload: {
  memberId: string;
  templateName: string;
}) {
  if (!supabase) throw Error("Connect Supabase to send WhatsApp messages.");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch("/api/whatsapp/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(session?.access_token
        ? { authorization: `Bearer ${session.access_token}` }
        : {}),
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Error(body?.error || "WhatsApp send failed.");
  return body as { ok?: boolean; status?: string; error?: string };
}
export async function liveLoad(): Promise<Data> {
  const { data, error } = await supabase!.rpc("get_gym_data");
  if (error) throw error;
  return data;
}
export type Action = {
  type: string;
  payload: Record<string, unknown>;
  requestId?: string;
};
export async function liveAction(a: Action) {
  const { error } = await supabase!.rpc("gym_action", {
    action_type: a.type,
    payload: a.payload,
    request_id: a.requestId || id(),
  });
  if (error) throw error;
  return liveLoad();
}
export async function logExport(kind: string) {
  if (!supabase) return;
  const { error } = await supabase.rpc("gym_action", {
    action_type: "export",
    payload: { kind },
    request_id: id(),
  });
  if (error) throw error;
}
export function demoAction(d: Data, a: Action): Data {
  const next = structuredClone(d),
    p = a.payload as any;
  let auditPayload: Record<string, unknown> = a.payload;
  const fingerprint = JSON.stringify(a.payload);
  if (a.requestId && next.requests?.[a.requestId]) {
    const old = next.requests[a.requestId];
    if (old.type !== a.type || old.payload !== fingerprint)
      throw Error("This request was already used for another action.");
    return next;
  }
  switch (a.type) {
    case "member": {
      const old = next.members.findIndex((m) => m.id === p.id);
      if (p.id && old < 0) throw Error("Member not found.");
      const errors = memberErrors(next, p, p.id);
      if (Object.keys(errors).length) throw Error(Object.values(errors)[0]);
      if (p.photo && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.photo) || p.photo.length > 100000)) throw Error("Invalid profile photo.");
      const m = {
        id: p.id || id(),
        name: p.name.trim(),
        phone: normalizePhone(p.phone),
        email: (p.email || "").trim(),
        gender: p.gender || "",
        address: p.address || "",
        height: p.height || "",
        weight: p.weight || "",
        joined: p.joined || today(),
        archived: p.archived || false,
        notes: p.notes || "",
        whatsappConsent: !!p.whatsappConsent,
        dob: p.dob ?? (old >= 0 ? next.members[old].dob : ""),
        leftOn: p.archived ? (old >= 0 && next.members[old].archived ? next.members[old].leftOn : today()) : undefined,
        photo: p.photo ?? (old >= 0 ? next.members[old].photo : ""),
      };
      if (old < 0) next.members.push(m);
      else next.members[old] = m;
      break;
    }
    case "membership":
      if(p.baseAmount !== undefined && discountTotal(p.baseAmount,p.discountType,p.discountValue).amount !== p.amount) throw Error("Invalid discount total.");
      next.memberships.push({
        id: id(),
        memberId: p.memberId,
        planName: p.planName,
        start: p.start,
        end: p.end,
        amount: p.amount,
        baseAmount: p.baseAmount ?? p.amount, discountType: p.discountType || "fixed", discountValue: p.discountValue || 0, discount: (p.baseAmount ?? p.amount)-p.amount,
        dueDate: p.dueDate || p.start,
      });
      break;
    case "freeze": {
      const i = next.memberships.findIndex((s) => s.id === p.id);
      next.memberships[i] = freezeMembership(
        next,
        p.id,
        p.start,
        p.end,
        p.reason,
      );
      break;
    }
    case "resume": {
      const s = next.memberships.find((s) => s.id === p.id);
      if (!s || !s.freezeEnd || s.freezeEnd < today())
        throw Error("No scheduled or current freeze to resume.");
      if (String(p.reason || "").trim().length < 5)
        throw Error("Provide a reason of at least five characters.");
      const unusedStart = s.freezeStart! > today() ? s.freezeStart! : today();
      const unused =
        Math.round(
          (Date.parse(s.freezeEnd) - Date.parse(unusedStart)) / 86400000,
        ) + 1;
      s.end = shiftDay(s.end, -unused);
      s.freezeEnd =
        s.freezeStart! >= today() ? undefined : shiftDay(today(), -1);
      if (!s.freezeEnd) s.freezeStart = undefined;
      break;
    }
    case "cancel": {
      const s = next.memberships.find((s) => s.id === p.id);
      if (!s || s.cancelled) throw Error("Available membership required.");
      if (String(p.reason || "").trim().length < 5)
        throw Error("Provide a reason of at least five characters.");
      s.cancelled = true;
      s.cancelReason = p.reason.trim();
      break;
    }
    case "dueDate": {
      const s = next.memberships.find((s) => s.id === p.id);
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(p.dueDate || ""))
        throw Error("Choose a valid payment due date.");
      s.dueDate = p.dueDate;
      break;
    }
    case "payment": {
      const previous = next.payments.find((x) => x.id === a.requestId);
      if (previous) {
        if (
          previous.membershipId !== p.membershipId ||
          previous.amount !== p.amount ||
          previous.method !== p.method ||
          previous.reference !== (p.reference || "")
        )
          throw Error("This request was already used for another payment.");
        return next;
      }
      validatePayment(next, p.membershipId, p.amount);
      if (!["Cash", "UPI", "Card", "Bank transfer"].includes(p.method))
        throw Error("Choose a valid payment method.");
      const m = next.memberships.find((m) => m.id === p.membershipId)!;
      next.payments.push({
        id: a.requestId || id(),
        requestId: a.requestId,
        membershipId: m.id,
        memberId: m.memberId,
        amount: p.amount,
        method: p.method,
        reference: p.reference || "",
        at: new Date().toISOString(),
        receipt: "DEMO-" + String(next.payments.length + 1).padStart(4, "0"),
        voided: false,
        voidReason: "",
        gymName: next.gym.name,
        gymPhone: next.gym.phone,
        gymAddress: next.gym.address,
        memberName: next.members.find((x) => x.id === m.memberId)!.name,
      });
      break;
    }
    case "void": {
      const pay = next.payments.find((x) => x.id === p.id) as Payment;
      pay.voided = true;
      pay.voidReason = p.reason;
      break;
    }
    case "attendance": {
      const m = next.members.find((m) => m.id === p.memberId)!;
      if (next.attendance.some((x) => x.memberId === m.id && x.day === today()))
        throw Error("This member has already checked in today.");
      if (!active(next, m) && !p.override)
        throw Error("An owner override reason is required.");
      next.attendance.push({
        id: id(),
        memberId: m.id,
        day: today(),
        at: new Date().toISOString(),
        override: p.override || "",
      });
      break;
    }
    case "checkout": {
      const visit=next.attendance.find(x=>x.id===p.id);
      if(!visit) throw Error("Check-in not found.");
      if(visit.day!==today()) throw Error("Only today's visits can be checked out.");
      if(visit.outAt) throw Error("This visit is already checked out.");
      auditPayload={...p,checkInAt:visit.at};
      visit.outAt=new Date(Math.max(Date.now(),Date.parse(visit.at))).toISOString();
      break;
    }
    case "attendanceRemove": {
      const i = next.attendance.findIndex((x) => x.id === p.id);
      if (i < 0) throw Error("Check-in not found.");
      if (String(p.reason || "").trim().length < 5)
        throw Error("Provide a reason of at least five characters.");
      auditPayload = { ...p, removedAttendance: next.attendance[i] };
      next.attendance.splice(i, 1);
      break;
    }
    case "reminder": {
      if (!next.members.some((m) => m.id === p.memberId))
        throw Error("Member not found.");
      const existing = p.id
        ? next.reminders.find((x) => x.id === p.id && x.memberId === p.memberId)
        : undefined;
      if (p.id && !existing) throw Error("Contact not found.");
      const record = {
        id: id(),
        memberId: p.memberId,
        kind: p.kind,
        at: new Date().toISOString(),
        note: p.note || "",
        nextDate: p.nextDate || "",
      };
      if (existing) {
        auditPayload = { ...p, previousContact: structuredClone(existing) };
        Object.assign(existing, record, { id: existing.id, at: existing.at });
      } else next.reminders.push(record);
      break;
    }
    case "settings":
      next.gym = { name: p.name, phone: p.phone, address: p.address };
      break;
    case "whatsappConfig": {
      next.whatsapp ??= emptyWhatsApp();
      const enabled = !!p.enabled;
      if (enabled && !String(p.phoneNumberId || "").trim())
        throw Error(
          "A WhatsApp phone number ID is required before enabling sending.",
        );
      next.whatsapp.config = {
        phoneNumberId: String(p.phoneNumberId || "").trim(),
        wabaId: String(p.wabaId || "").trim(),
        displayName: String(p.displayName || "").trim(),
        senderPhone: String(p.senderPhone || "").trim(),
        enabled,
        dailySendCap: Number(p.dailySendCap) || 200,
        quietStart: p.quietStart || "21:00",
        quietEnd: p.quietEnd || "08:00",
      };
      break;
    }
    case "whatsappTemplate": {
      next.whatsapp ??= emptyWhatsApp();
      const name = String(p.name || "").trim();
      if (!/^[a-z0-9_]+$/.test(name) || name.length > 512)
        throw Error(
          "Template name must use lowercase letters, numbers and underscores.",
        );
      if (!String(p.body || "").trim())
        throw Error("Template message body is required.");
      const variables = Array.from(
        String(p.body).matchAll(/\{\{\s*(\w+)\s*\}\}/g),
        (match) => match[1],
      );
      if (
        variables.some((v) => !(WA_VARIABLES as readonly string[]).includes(v))
      )
        throw Error(
          "Use only the supported template variables shown in the editor.",
        );
      if (!["utility", "marketing", "authentication"].includes(p.category))
        throw Error("Category must be utility, marketing or authentication.");
      const template = {
        id: p.id || id(),
        name,
        category: p.category,
        language: p.language || "en",
        body: p.body,
        variables,
        status: p.status || "draft",
        isActive: p.isActive !== false,
      };
      if (p.id) {
        const i = next.whatsapp.templates.findIndex((x) => x.id === p.id);
        if (i < 0) throw Error("Template not found.");
        if (
          next.whatsapp.templates.some((x) => x.id !== p.id && x.name === name)
        )
          throw Error("A template with that name already exists.");
        const previous = next.whatsapp.templates[i].name;
        next.whatsapp.templates[i] = template;
        next.whatsapp.rules.forEach((r) => {
          if (r.templateName === previous) r.templateName = name;
        });
      } else {
        if (next.whatsapp.templates.some((x) => x.name === name))
          throw Error("A template with that name already exists.");
        next.whatsapp.templates.push(template);
      }
      break;
    }
    case "whatsappTemplateDelete": {
      next.whatsapp ??= emptyWhatsApp();
      const i = next.whatsapp.templates.findIndex((x) => x.id === p.id);
      if (i < 0) throw Error("Template not found.");
      if (
        next.whatsapp.rules.some(
          (r) => r.templateName === next.whatsapp!.templates[i].name,
        )
      )
        throw Error(
          "Remove or reassign rules using this template before deleting it.",
        );
      next.whatsapp.templates.splice(i, 1);
      break;
    }
    case "reminderRule": {
      next.whatsapp ??= emptyWhatsApp();
      if (!["expiring", "expired", "has_dues", "inactive"].includes(p.audience))
        throw Error("Choose a valid audience.");
      if (!String(p.name || "").trim()) throw Error("Rule name is required.");
      if (
        !Number.isInteger(Number(p.offsetDays)) ||
        Number(p.offsetDays) < -365 ||
        Number(p.offsetDays) > 365
      )
        throw Error("Offset must be a whole number between -365 and 365 days.");
      if (p.audience === "inactive" && p.isActive !== false)
        throw Error(
          "Inactive-member automation is not available yet. Choose another audience.",
        );
      if (!next.whatsapp.templates.some((t) => t.name === p.templateName))
        throw Error("Choose an existing template.");
      const rule = {
        id: p.id || id(),
        name: String(p.name || "").trim(),
        offsetDays: Number(p.offsetDays) || 0,
        templateName: p.templateName,
        audience: p.audience,
        isActive: p.isActive !== false,
      };
      if (p.id) {
        const i = next.whatsapp.rules.findIndex((x) => x.id === p.id);
        if (i < 0) throw Error("Reminder rule not found.");
        next.whatsapp.rules[i] = rule;
      } else next.whatsapp.rules.push(rule);
      break;
    }
    case "reminderRuleDelete": {
      next.whatsapp ??= emptyWhatsApp();
      const i = next.whatsapp.rules.findIndex((x) => x.id === p.id);
      if (i < 0) throw Error("Reminder rule not found.");
      next.whatsapp.rules.splice(i, 1);
      break;
    }
    case "whatsappSeed": {
      next.whatsapp ??= emptyWhatsApp();
      const names = new Set(next.whatsapp.templates.map((t) => t.name));
      for (const t of defaultTemplates())
        if (!names.has(t.name)) next.whatsapp.templates.push(t);
      if (!next.whatsapp.rules.length)
        next.whatsapp.rules.push(...defaultRules());
      break;
    }
    case "whatsappSend": {
      next.whatsapp ??= emptyWhatsApp();
      const member = next.members.find((m) => m.id === p.memberId);
      if (!member) throw Error("Member not found.");
      const template = next.whatsapp.templates.find(
        (t) => t.name === p.templateName,
      );
      if (!template) throw Error("Template not found.");
      next.whatsapp.messages.unshift({
        id: id(),
        memberId: member.id,
        direction: "out",
        templateName: template.name,
        waMessageId: "demo-" + id(),
        phone: member.phone,
        body: renderTemplate(template.body, waVariables(next, member.id)),
        status: next.whatsapp.config.enabled ? "simulated" : "failed",
        error: next.whatsapp.config.enabled
          ? ""
          : "WhatsApp sending is disabled.",
        at: new Date().toISOString(),
      });
      break;
    }
    case "plan": {
      if (p.id) {
        const i = next.plans.findIndex((x) => x.id === p.id);
        if (i < 0) throw Error("Plan not found.");
        next.plans[i] = p;
      } else next.plans.push({ ...p, id: id() });
      break;
    }
    case "planDelete": {
      const i = next.plans.findIndex((x) => x.id === p.id);
      if (i < 0) throw Error("Plan not found.");
      next.plans.splice(i, 1);
      break;
    }
    case "memberDelete": {
      const i = next.members.findIndex((m) => m.id === p.id);
      if (i < 0) throw Error("Member not found.");
      if (next.payments.some((pay) => pay.memberId === p.id))
        throw Error(
          "This member has payment records. Archive the member instead of deleting.",
        );
      next.members.splice(i, 1);
      next.memberships = next.memberships.filter((s) => s.memberId !== p.id);
      next.attendance = next.attendance.filter((x) => x.memberId !== p.id);
      next.reminders = next.reminders.filter((x) => x.memberId !== p.id);
      if (next.whatsapp)
        next.whatsapp.messages = next.whatsapp.messages.filter(
          (x) => x.memberId !== p.id,
        );
      break;
    }
    case "membershipEdit": {
      if(p.baseAmount !== undefined && discountTotal(p.baseAmount,p.discountType,p.discountValue).amount !== p.amount) throw Error("Invalid discount total.");
      const m = next.memberships.find(x => x.id === p.id);
      if (!m || m.cancelled) throw Error("Available membership required.");
      if (!String(p.planName || "").trim()) throw Error("Plan name is required.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start || "") || !/^\d{4}-\d{2}-\d{2}$/.test(p.end || "") || p.end < p.start) throw Error("Choose a valid membership period.");
      if (!Number.isSafeInteger(p.amount) || p.amount < 0) throw Error("Enter a valid membership fee.");
      const paid = next.payments.filter(x => x.membershipId === m.id && !x.voided).reduce((sum, x) => sum + x.amount, 0);
      if (p.amount < paid) throw Error("Fee cannot be less than payments already collected.");
      if (next.memberships.some(x => x.id !== m.id && x.memberId === m.memberId && !x.cancelled && x.start <= p.end && x.end >= p.start)) throw Error("Membership dates overlap an existing period.");
      if (String(p.reason || "").trim().length < 5) throw Error("Provide a reason of at least five characters.");
      auditPayload = {...p, previousMembership: structuredClone(m)};
      Object.assign(m, {baseAmount:p.baseAmount ?? p.amount,discountType:p.discountType||"fixed",discountValue:p.discountValue||0,discount:(p.baseAmount??p.amount)-p.amount,planName: p.planName.trim(), start: p.start, end: p.end, amount: p.amount, dueDate: p.dueDate || undefined, freezeStart: undefined, freezeEnd: undefined, freezeReason: undefined});
      break;
    }
    case "membershipExpire": {
      const s = next.memberships.find((x) => x.id === p.id);
      if (!s) throw Error("Membership not found.");
      if (s.cancelled) throw Error("Cancelled memberships cannot be expired.");
      if (s.freezeEnd && s.freezeEnd >= today())
        throw Error(
          "Resume the scheduled or current freeze before changing expiry.",
        );
      if (String(p.reason || "").trim().length < 5)
        throw Error("Provide a reason of at least five characters.");
      if (!p.endDate) throw Error("Choose the day access should end.");
      if (p.endDate < s.start || p.endDate > s.end)
        throw Error("Choose a day within the membership period.");
      auditPayload = { ...p, previousMembership: structuredClone(s) };
      s.end = p.endDate;
      break;
    }
    case "staffAdd": {
      next.staff ??= [];
      const email = String(p.email || "")
        .trim()
        .toLowerCase();
      if (!/^[^ @]+@[^ @]+[.][^ @]+$/.test(email))
        throw Error(
          "Enter the staff email address used in Supabase Authentication.",
        );
      if (!["owner", "reception"].includes(p.role))
        throw Error("Choose a valid staff role.");
      if (next.staff.some((s) => s.email === email))
        throw Error("This account is already a staff member.");
      next.staff.push({ id: id(), email, role: p.role, enabled: true });
      next.staff.sort((a, b) =>
        a.role === b.role
          ? a.email.localeCompare(b.email)
          : a.role < b.role
            ? -1
            : 1,
      );
      break;
    }
    case "staffUpdate": {
      next.staff ??= [];
      const s = next.staff.find((x) => x.id === p.id);
      if (!s) throw Error("Staff member not found.");
      if (!["owner", "reception"].includes(p.role))
        throw Error("Choose a valid staff role.");
      const enabled = p.enabled ?? true;
      if (s.self && (p.role !== "owner" || !enabled))
        throw Error("You cannot remove your own owner access.");
      if (p.role !== "owner" || !enabled) {
        const otherOwner = next.staff.some(
          (x) => x.id !== p.id && x.role === "owner" && x.enabled,
        );
        if (!otherOwner) throw Error("At least one enabled owner is required.");
      }
      s.role = p.role;
      s.enabled = enabled;
      break;
    }
    case "staffRemove": {
      next.staff ??= [];
      const i = next.staff.findIndex((x) => x.id === p.id);
      if (i < 0) throw Error("Staff member not found.");
      if (next.staff[i].self)
        throw Error("You cannot remove your own staff access.");
      if (next.staff[i].role === "owner") {
        const otherOwner = next.staff.some(
          (x) => x.id !== p.id && x.role === "owner" && x.enabled,
        );
        if (!otherOwner) throw Error("At least one enabled owner is required.");
      }
      next.staff.splice(i, 1);
      break;
    }
    case "export":
      if (!String(p.kind || "").trim()) throw Error("Export kind is required.");
      break;
    default:
      throw Error("Unknown action.");
  }
  if (a.requestId) {
    next.requests ??= {};
    next.requests[a.requestId] = { type: a.type, payload: fingerprint };
  }
  next.audit ??= [];
  next.audit.unshift({
    id: id(),
    actor: "owner@demo.local",
    action: a.type,
    payload: auditPayload,
    at: new Date().toISOString(),
  });
  if (next.audit.length > 200) next.audit.length = 200;
  demoSave(next);
  return next;
}

