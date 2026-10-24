import { ServerHistory } from "./shared/ServerHistory";
import { supportsHistory } from "./data/history";
import type { AuditEntry } from "./domain";
import { useState, type FormEvent } from "react";
import {
  UserPlus,
  ShieldCheck,
  UserCog,
  History,
  ChevronRight,
} from "lucide-react";
import type { Data, StaffRole } from "./domain";
import type { Action } from "./api";
const roleLabel: Record<string, string> = {
  owner: "Admin",
  reception: "Staff",
};
const actionLabel = (a: string) => {
  const map: Record<string, string> = {
    member: "Member saved",
    memberDelete: "Member deleted",
    membership: "Membership created",
    membershipEdit: "Membership details updated",
    membershipExpire: "Membership expired",
    freeze: "Membership frozen",
    resume: "Membership resumed",
    cancel: "Membership cancelled",
    dueDate: "Due date changed",
    payment: "Payment collected",
    void: "Payment voided",
    attendance: "Check-in recorded",
    checkout: "Member checked out",
    attendanceRemove: "Check-in corrected",
    reminder: "Contact logged",
    settings: "Gym details changed",
    plan: "Plan saved",
    planDelete: "Plan deleted",
    staffAdd: "Staff added",
    staffUpdate: "Staff updated",
    staffRemove: "Staff removed",
    whatsappConfig: "WhatsApp settings changed",
    whatsappTemplate: "WhatsApp template saved",
    whatsappTemplateDelete: "WhatsApp template deleted",
    reminderRule: "Reminder rule saved",
    reminderRuleDelete: "Reminder rule deleted",
    whatsappSeed: "Default templates added",
  };
  return (
    map[a] || a.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())
  );
};
const stamp = (s: string) =>
  new Date(s).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export function StaffManager({
  data,
  busy,
  mutate,
  flash,
}: {
  data: Data;
  busy: boolean;
  mutate: (a: Action, message?: string) => Promise<unknown>;
  flash: (s: string) => void;
}) {
  const staff = data.staff ?? [];
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("reception");
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const saved = await mutate(
      { type: "staffAdd", payload: { email: email.trim(), role } },
      "Staff added",
    );
    if (!saved) return;
    setEmail("");
    setRole("reception");
  }
  return (
    <section className="panel settings-card">
      <div className="panel-header">
        <h2>
          <UserCog size={18} /> Staff &amp; access
        </h2>
        <span className="section-caption">
          {staff.length} {staff.length === 1 ? "account" : "accounts"}
        </span>
      </div>
      <p className="helper">
        Admins manage everything. Staff can record members, payments,
        memberships and attendance. Create the person's account in Supabase
        Authentication first, then add their email here.
      </p>
      <div
        className="record-scroll"
        role="region"
        aria-label="Staff accounts"
        tabIndex={0}
      >
        {staff.map((s) => (
          <div className="list-item" key={s.id}>
            <span className="list-icon">
              <ShieldCheck size={18} />
            </span>
            <div>
              <strong>{s.email}</strong>
              <small>
                {roleLabel[s.role] || s.role}
                {s.self && " · You"}
                {!s.enabled && " · Disabled"}
              </small>
            </div>
            <select
              aria-label={`Role for ${s.email}`}
              value={s.role}
              disabled={busy || s.self}
              onChange={(e) =>
                mutate(
                  {
                    type: "staffUpdate",
                    payload: {
                      id: s.id,
                      role: e.target.value === "owner" ? "owner" : "reception",
                      enabled: s.enabled,
                    },
                  },
                  "Staff role updated",
                )
              }
            >
              <option value="owner">Admin</option>
              <option value="reception">Staff</option>
            </select>
            <button
              className="small-button"
              disabled={busy || s.self}
              onClick={() =>
                mutate(
                  {
                    type: "staffUpdate",
                    payload: { id: s.id, role: s.role, enabled: !s.enabled },
                  },
                  s.enabled ? "Staff disabled" : "Staff enabled",
                )
              }
            >
              {s.enabled ? "Disable" : "Enable"}
            </button>
            <button
              className="small-button danger-text"
              disabled={busy || s.self}
              onClick={() => {
                if (
                  confirm(
                    `Remove access for ${s.email}? Their account stays in Authentication.`,
                  )
                )
                  mutate(
                    { type: "staffRemove", payload: { id: s.id } },
                    "Staff removed",
                  );
                else flash("No changes made");
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <form className="inline-form staff-add" onSubmit={add}>
        <input
          type="email"
          aria-label="New staff email"
          placeholder="staff@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <select
          aria-label="New staff role"
          value={role}
          onChange={(e) => setRole(e.target.value as StaffRole)}
        >
          <option value="reception">Staff user</option>
          <option value="owner">Admin user</option>
        </select>
        <button className="primary" disabled={busy || !email.trim()}>
          <UserPlus size={16} /> Add staff
        </button>
      </form>
    </section>
  );
}
export function AuditLog({ data }: { data: Data }) {
  const audit = data.audit ?? [];
  return (
    <section className="panel settings-card">
      <div className="panel-header">
        <h2>
          <History size={18} /> Activity audit
        </h2>
        <span className="section-caption">
          {supportsHistory(data)
            ? "Newest first"
            : `Latest ${audit.length} actions`}
        </span>
      </div>
      <p className="helper">
        Every saved change is recorded with the staff account that made it.
        Admins can review this trail; it cannot be edited or deleted here.
      </p>

      {supportsHistory(data) ? (
        <ServerHistory<AuditEntry>
          label="audit records"
          revision={data.audit}
          query={{ kind: "audit" }}
          render={(rows) => <AuditRows audit={rows} />}
        />
      ) : (
        <AuditRows audit={audit} />
      )}
    </section>
  );
}

function AuditRows({ audit }: { audit: AuditEntry[] }) {
  return (
    <>
      <div
        className="record-scroll"
        role="region"
        aria-label="Activity audit records"
        tabIndex={0}
      >
        {audit.map((a) => (
          <details className="audit-row" key={a.id}>
            <summary>
              <span className="list-icon">
                <History size={16} />
              </span>
              <strong>{actionLabel(a.action)}</strong>
              <span className="audit-meta">
                {a.actor || "Unknown"} · {stamp(a.at)}
              </span>
              <ChevronRight size={16} />
            </summary>
            <pre className="audit-payload">
              {JSON.stringify(a.payload, null, 2)}
            </pre>
          </details>
        ))}
      </div>
      {!audit.length && <p className="helper">No recorded activity yet.</p>}
    </>
  );
}
