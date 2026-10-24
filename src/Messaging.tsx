import { MemberAvatar } from "./MemberAvatar";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Clock,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import {
  WA_VARIABLES,
  dueReminders,
  emptyWhatsAppConfig,
  renderTemplate,
  waVariables,
  type Data,
  type ReminderAudience,
  type ReminderRule,
  type TemplateCategory,
  type WhatsApp,
  type WhatsAppConfig,
  type WhatsAppTemplate,
} from "./domain";
import { type Action } from "./api";
const audiences: { value: ReminderAudience; label: string; hint: string }[] = [
  {
    value: "expiring",
    label: "Expiring",
    hint: "Ends exactly offset days away",
  },
  { value: "expired", label: "Expired", hint: "Ended offset days ago" },
  {
    value: "has_dues",
    label: "Has dues",
    hint: "Fee due exactly offset days ago",
  },
  { value: "inactive", label: "Inactive", hint: "Reserved for future use" },
];
const categories: TemplateCategory[] = [
  "utility",
  "marketing",
  "authentication",
];
const statusLabel = (s: string) =>
  s === "simulated" ? "Simulated" : s.charAt(0).toUpperCase() + s.slice(1);
const stamp = (s: string) =>
  new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
export function Messaging({
  data,
  role,
  busy,
  mutate,
  sendMessage,
  flash,
  logOnly = false,
  initialSection = "Queue",
  onDirtyChange,
  onSendingChange,
}: {
  logOnly?: boolean;
  initialSection?: "Queue" | "Setup";
  onDirtyChange?: (dirty: boolean) => void;
  onSendingChange?: (sending: boolean) => void;
  data: Data;
  role: string;
  busy: boolean;
  mutate: (a: Action, message?: string) => Promise<unknown>;
  sendMessage: (memberId: string, templateName: string) => Promise<boolean>;
  flash: (s: string) => void;
}) {
  const wa: WhatsApp = data.whatsapp ?? {
      config: emptyWhatsAppConfig(),
      templates: [],
      rules: [],
      messages: [],
    },
    owner = role === "owner",
    [tab, setTab] = useState<"Queue" | "Templates" | "Rules" | "Log" | "Setup">(
      logOnly ? "Log" : initialSection,
    ),
    [tpl, setTpl] = useState<Partial<WhatsAppTemplate> | null>(null),
    [rule, setRule] = useState<Partial<ReminderRule> | null>(null),
    [picked, setPicked] = useState<Record<string, boolean>>({}),
    [sending, setSending] = useState(false),
    [editorDirty, setEditorDirty] = useState(false);
  useEffect(() => {
    onDirtyChange?.(!!(editorDirty && (tpl || rule || tab === "Setup")));
    return () => onDirtyChange?.(false);
  }, [editorDirty, tpl, rule, tab, onDirtyChange]);
  useEffect(() => {
    onSendingChange?.(sending);
    return () => onSendingChange?.(false);
  }, [sending, onSendingChange]);
  const queue = useMemo(
    () =>
      dueReminders({
        ...data,
        whatsapp: { ...wa, config: { ...wa.config, enabled: true } },
      }),
    [data, wa],
  );
  const memberName = (id?: string | null) =>
    data.members.find((m) => m.id === id)?.name || "Unknown member";
  const queueKey = (memberId: string, templateName: string) =>
    memberId + "|" + templateName;
  const chosen = queue.filter(
    (q) => picked[queueKey(q.memberId, q.templateName)],
  );
  const targets = chosen.length ? chosen : queue;
  async function sendSelected() {
    if (!wa.config.enabled) {
      flash("Enable WhatsApp sending in Setup first.");
      return;
    }
    if (!targets.length) return;
    setSending(true);
    let sent = 0,
      failed = 0;
    for (const q of targets) {
      const ok = await sendMessage(q.memberId, q.templateName);
      ok ? sent++ : failed++;
    }
    setSending(false);
    setPicked({});
    flash(
      failed
        ? `${sent} sent, ${failed} failed. Check the message log.`
        : `${sent} message${sent === 1 ? "" : "s"} sent.`,
    );
  }
  async function submitTemplate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = String(f.get("body") || "");
    const variables = Array.from(
      body.matchAll(/\{\{\s*(\w+)\s*\}\}/g),
      (match) => match[1],
    );
    const saved = await mutate(
      {
        type: "whatsappTemplate",
        payload: {
          id: tpl?.id,
          name: String(f.get("name") || "").trim(),
          category: String(f.get("category") || "utility"),
          language: String(f.get("language") || "en").trim() || "en",
          body,
          variables,
          isActive: f.get("isActive") === "on",
        },
      },
      "Template saved",
    );
    if (saved) {
      setTpl(null);
      setEditorDirty(false);
    }
  }
  async function submitRule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const saved = await mutate(
      {
        type: "reminderRule",
        payload: {
          id: rule?.id,
          name: String(f.get("name") || "").trim(),
          offsetDays: Number(f.get("offsetDays")),
          templateName: String(f.get("templateName") || ""),
          audience: String(f.get("audience") || ""),
          isActive: f.get("isActive") === "on",
        },
      },
      "Reminder rule saved",
    );
    if (saved) {
      setRule(null);
      setEditorDirty(false);
    }
  }
  async function submitConfig(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const saved = await mutate(
      {
        type: "whatsappConfig",
        payload: {
          phoneNumberId: String(f.get("phoneNumberId") || "").trim(),
          wabaId: String(f.get("wabaId") || "").trim(),
          displayName: String(f.get("displayName") || "").trim(),
          senderPhone: String(f.get("senderPhone") || "").trim(),
          enabled: f.get("enabled") === "on",
          dailySendCap: Number(f.get("dailySendCap")) || 200,
          quietStart: String(f.get("quietStart") || ""),
          quietEnd: String(f.get("quietEnd") || ""),
        },
      },
      "WhatsApp settings saved",
    );
    if (saved) setEditorDirty(false);
  }
  return (
    <>
      {!logOnly && (
        <div className="tabs" aria-label="Messaging sections">
          {(["Queue", "Templates", "Rules", "Setup"] as const).map((x) => (
            <button
              key={x}
              className={tab === x ? "active" : ""}
              aria-pressed={tab === x}
              disabled={busy || sending}
              onClick={() => {
                if (
                  tab !== x &&
                  editorDirty &&
                  (tpl || rule || tab === "Setup") &&
                  !confirm("Discard unsaved reminder changes?")
                )
                  return;
                if (tab !== x) {
                  setTpl(null);
                  setRule(null);
                  setEditorDirty(false);
                }
                setTab(x);
              }}
            >
              {x}
              {x === "Queue" && queue.length > 0 && <b> {queue.length}</b>}
            </button>
          ))}
        </div>
      )}
      {tab === "Queue" && (
        <>
          <section className="panel">
            <div className="panel-header">
              <h2>Reminders due today</h2>
              <Badge2
                ok={wa.config.enabled}
                text={
                  wa.config.enabled ? "Automated sending on" : "Sending off"
                }
              />
            </div>
            {!wa.config.enabled && (
              <p className="helper">
                Sending is off. Add your WhatsApp number under Setup and enable
                sending to dispatch reminders.
              </p>
            )}
            <div
              className="record-scroll"
              role="region"
              aria-label="Automated reminder queue"
              tabIndex={0}
            >
              {queue.length === 0 ? (
                <p className="helper">
                  No reminders are due today for your active rules.
                </p>
              ) : (
                queue.map((q) => {
                  const key = queueKey(q.memberId, q.templateName);
                  return (
                    <label className="reminder-row" key={key}>
                      <input
                        type="checkbox"
                        checked={!!picked[key]}
                        onChange={(e) =>
                          setPicked((p) => ({ ...p, [key]: e.target.checked }))
                        }
                      />
                      <div>
                        <span className="member-identity">
                          <MemberAvatar
                            name={memberName(q.memberId)}
                            photo={
                              data.members.find((m) => m.id === q.memberId)
                                ?.photo
                            }
                          />
                          <strong>{memberName(q.memberId)}</strong>
                        </span>
                        <small>
                          {q.template.name} · {q.template.category}
                        </small>
                        <p className="helper">{q.body}</p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            {queue.length > 0 && (
              <div className="panel-header">
                <span className="helper">
                  {chosen.length
                    ? `${chosen.length} selected`
                    : `All ${queue.length} will be sent`}
                </span>
                <button
                  className="small-button"
                  disabled={busy || sending || !wa.config.enabled}
                  onClick={() => void sendSelected()}
                >
                  <Send size={15} />
                  {sending ? "Sending…" : "Send now"}
                </button>
              </div>
            )}
          </section>
          <p className="helper">
            Messages are sent through the WhatsApp Cloud API as pre-approved
            utility templates. Next-day safety prevents the same reminder from
            repeating.
          </p>
        </>
      )}
      {tab === "Templates" && (
        <section className="panel">
          <div className="panel-header">
            <h2>Templates</h2>
            {owner && (
              <span>
                <button
                  className="secondary"
                  disabled={busy || !!tpl}
                  onClick={() =>
                    void mutate(
                      { type: "whatsappSeed", payload: {} },
                      "Default templates added",
                    )
                  }
                >
                  <RefreshCw size={15} />
                  Add defaults
                </button>{" "}
                <button
                  className="small-button"
                  disabled={busy || !!tpl}
                  onClick={() =>
                    setTpl({
                      category: "utility",
                      language: "en",
                      isActive: true,
                    })
                  }
                >
                  <Plus size={15} />
                  New template
                </button>
              </span>
            )}
          </div>
          {tpl && (
            <form
              className="inline-form"
              onSubmit={submitTemplate}
              onInput={() => setEditorDirty(true)}
            >
              <div className="form-grid">
                <label>
                  Name
                  <input
                    name="name"
                    required
                    pattern="[a-z0-9_]+"
                    maxLength={512}
                    defaultValue={tpl.name}
                    placeholder="renewal_reminder"
                  />
                </label>
                <label>
                  Category
                  <select
                    name="category"
                    defaultValue={tpl.category || "utility"}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Language
                  <input name="language" defaultValue={tpl.language || "en"} />
                </label>
              </div>
              <label>
                Message body
                <textarea
                  name="body"
                  required
                  maxLength={1024}
                  rows={4}
                  defaultValue={tpl.body}
                  placeholder="Hi {{member_name}}, your plan expires on {{expiry_date}}."
                />
              </label>
              <p className="helper">
                Placeholders: {WA_VARIABLES.map((v) => `{{${v}}}`).join(", ")}
              </p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={tpl.isActive !== false}
                />
                Active
              </label>
              <div className="form-grid">
                <button className="small-button" disabled={busy}>
                  Save template
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    setTpl(null);
                    setEditorDirty(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <div
            className="record-scroll"
            role="region"
            aria-label="Message templates"
            tabIndex={0}
          >
            {wa.templates.map((t) => (
              <div className="list-item" key={t.id}>
                <span className="list-icon">
                  <MessageCircle size={18} />
                </span>
                <div>
                  <strong>{t.name}</strong>
                  <small>
                    {t.category} · {t.language} · {statusLabel(t.status)}
                    {!t.isActive && " · inactive"}
                  </small>
                  <p className="helper">{t.body}</p>
                </div>
                {owner && (
                  <span>
                    <button
                      className="small-button"
                      disabled={busy || !!tpl}
                      onClick={() => setTpl(t)}
                    >
                      Edit
                    </button>{" "}
                    <button
                      className="danger-button"
                      aria-label={`Delete template ${t.name}`}
                      disabled={busy}
                      onClick={() =>
                        void mutate(
                          {
                            type: "whatsappTemplateDelete",
                            payload: { id: t.id },
                          },
                          "Template deleted",
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
          {!wa.templates.length && (
            <p className="helper">
              No templates yet. Add the defaults to start.
            </p>
          )}
        </section>
      )}
      {tab === "Rules" && (
        <section className="panel">
          <div className="panel-header">
            <h2>Reminder rules</h2>
            {owner && (
              <button
                className="small-button"
                disabled={busy || !wa.templates.length || !!rule}
                onClick={() =>
                  setRule({
                    audience: "expiring",
                    offsetDays: -3,
                    isActive: true,
                  })
                }
              >
                <Plus size={15} />
                New rule
              </button>
            )}
          </div>
          {rule && (
            <form
              className="inline-form"
              onSubmit={submitRule}
              onInput={() => setEditorDirty(true)}
            >
              <div className="form-grid">
                <label>
                  Rule name
                  <input name="name" required defaultValue={rule.name} />
                </label>
                <label>
                  Offset (days)
                  <input
                    name="offsetDays"
                    type="number"
                    required
                    min={-365}
                    max={365}
                    defaultValue={rule.offsetDays ?? 0}
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Template
                  <select
                    name="templateName"
                    required
                    defaultValue={rule.templateName}
                  >
                    <option value="">Choose a template</option>
                    {wa.templates.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Audience
                  <select
                    name="audience"
                    defaultValue={rule.audience || "expiring"}
                  >
                    {audiences
                      .filter(
                        (a) =>
                          a.value !== "inactive" ||
                          rule.audience === "inactive",
                      )
                      .map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <p className="helper">
                Negative offsets run before expiry (for example −3 = three days
                before), positive offsets run after.
              </p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={rule.isActive !== false}
                />
                Active
              </label>
              <div className="form-grid">
                <button className="small-button" disabled={busy}>
                  Save rule
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    setRule(null);
                    setEditorDirty(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <div
            className="record-scroll"
            role="region"
            aria-label="Automation rules"
            tabIndex={0}
          >
            {wa.rules.map((r) => (
              <div className="list-item" key={r.id}>
                <span className="list-icon">
                  <Clock size={18} />
                </span>
                <div>
                  <strong>{r.name}</strong>
                  <small>
                    {r.audience} · {r.offsetDays >= 0 ? "+" : ""}
                    {r.offsetDays} days · {r.templateName}
                    {!r.isActive && " · paused"}
                  </small>
                </div>
                {owner && (
                  <span>
                    <button
                      className="small-button"
                      disabled={busy || !!rule}
                      onClick={() => setRule(r)}
                    >
                      Edit
                    </button>{" "}
                    <button
                      className="danger-button"
                      aria-label={`Delete reminder rule ${r.name}`}
                      disabled={busy}
                      onClick={() =>
                        void mutate(
                          { type: "reminderRuleDelete", payload: { id: r.id } },
                          "Rule deleted",
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
          {!wa.rules.length && (
            <p className="helper">No rules yet. Add defaults from Templates.</p>
          )}
        </section>
      )}
      {tab === "Log" && (
        <section className="panel">
          <div className="panel-header">
            <h2>Message log</h2>
            <Badge2 ok text={`${wa.messages.length} recent`} />
          </div>
          <div
            className="record-scroll"
            role="region"
            aria-label="Message delivery records"
            tabIndex={0}
          >
            {wa.messages.map((m) => (
              <div className="list-item" key={m.id}>
                <MemberAvatar
                  name={memberName(m.memberId)}
                  photo={data.members.find((x) => x.id === m.memberId)?.photo}
                />
                <div>
                  <strong>
                    {memberName(m.memberId)}
                    {m.direction === "in" ? " replied" : ""}
                  </strong>
                  <small>
                    {stamp(m.at)} · {m.templateName || "message"} ·{" "}
                    {statusLabel(m.status)}
                    {m.error && " · " + m.error}
                  </small>
                  <p className="helper">{m.body}</p>
                </div>
              </div>
            ))}
          </div>
          {!wa.messages.length && (
            <p className="helper">No messages sent or received yet.</p>
          )}
        </section>
      )}
      {tab === "Setup" && (
        <section className="panel">
          <div className="panel-header">
            <h2>WhatsApp Cloud API</h2>
            <Badge2
              ok={wa.config.enabled}
              text={wa.config.enabled ? "Enabled" : "Disabled"}
            />
          </div>
          {!owner ? (
            <p className="helper">
              Only the admin can change WhatsApp settings.
            </p>
          ) : (
            <form
              className="inline-form"
              onSubmit={submitConfig}
              onChange={() => setEditorDirty(true)}
            >
              <div className="form-grid">
                <label>
                  Phone number ID
                  <input
                    name="phoneNumberId"
                    defaultValue={wa.config.phoneNumberId}
                    placeholder="From Meta WhatsApp Manager"
                  />
                </label>
                <label>
                  WABA ID
                  <input name="wabaId" defaultValue={wa.config.wabaId} />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Display name
                  <input
                    name="displayName"
                    defaultValue={wa.config.displayName}
                  />
                </label>
                <label>
                  Sender phone
                  <input
                    name="senderPhone"
                    defaultValue={wa.config.senderPhone}
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Daily send cap
                  <input
                    name="dailySendCap"
                    type="number"
                    min={1}
                    max={5000}
                    defaultValue={wa.config.dailySendCap}
                  />
                </label>
                <label>
                  Quiet hours start
                  <input
                    name="quietStart"
                    type="time"
                    defaultValue={wa.config.quietStart}
                  />
                </label>
                <label>
                  Quiet hours end
                  <input
                    name="quietEnd"
                    type="time"
                    defaultValue={wa.config.quietEnd}
                  />
                </label>
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={wa.config.enabled}
                />
                Enable automated sending
              </label>
              <p className="helper">
                The access token stays in the server environment
                (WHATSAPP_TOKEN) and is never stored in the database.
              </p>
              <button className="small-button" disabled={busy}>
                Save settings
              </button>
            </form>
          )}
        </section>
      )}
    </>
  );
}
function Badge2({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className="badge">
      {ok ? <CheckCircle2 size={14} /> : <ShieldCheck size={14} />}
      {text}
    </span>
  );
}
