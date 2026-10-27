import {
  UserPlus,
  Wallet,
  Activity,
  CreditCard,
  ArrowUpRight,
  Lightbulb,
} from "lucide-react";
import { MemberAvatar } from "./MemberAvatar";
import { type Data, type Member, latest, date } from "./domain";
export function DashboardShortcuts({
  data,
  add,
  collect,
  pending,
  attendance,
  members,
  open,
  setup,
  section,
}: {
  section: "actions" | "members" | "tip";
  data: Data;
  add: () => void;
  collect: () => void;
  pending: () => void;
  attendance: () => void;
  members: () => void;
  open: (m: Member) => void;
  setup: () => void;
}) {
  const recent = [...data.members]
    .sort(
      (a, b) => b.joined.localeCompare(a.joined) || b.id.localeCompare(a.id),
    )
    .slice(0, 3);
  const actions = [
    {
      title: "Add new member",
      description: "Register a member",
      icon: UserPlus,
      action: add,
      tone: "red",
    },
    {
      title: "Collect fee",
      description: "Record payment & receipt",
      icon: Wallet,
      action: collect,
      tone: "green",
    },
    {
      title: "View pending fees",
      description: "Review outstanding balances",
      icon: CreditCard,
      action: pending,
      tone: "gold",
    },
    {
      title: "Add attendance",
      description: "Check a member in",
      icon: Activity,
      action: attendance,
      tone: "purple",
    },
  ];
  return (
    <>
      {section === "actions" && (
        <section className="panel quick-actions-panel">
          <div className="panel-header">
            <h2>Quick actions</h2>
          </div>
          <div className="quick-action-grid">
            {actions.map(({ title, description, icon: Icon, action, tone }) => (
              <button
                type="button"
                className={`quick-action-tile ${tone}`}
                key={title}
                onClick={action}
              >
                <Icon size={23} />
                <strong>{title}</strong>
                <small>{description}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      {section === "members" && (
        <section className="panel recent-members-panel">
          <div className="panel-header">
            <h2>Recent members</h2>
            <button
              className="text-button"
              onClick={members}
              aria-label="View all recent members"
            >
              View all <ArrowUpRight size={14} />
            </button>
          </div>
          {recent.map((m) => {
            const plan = latest(data, m.id)?.planName || "No plan";
            return (
              <button
                type="button"
                className="list-item list-item-button"
                key={m.id}
                onClick={() => open(m)}
                aria-label={`Open ${m.name}`}
              >
                <MemberAvatar name={m.name} photo={m.photo} />
                <div>
                  <strong>{m.name}</strong>
                  <small>{plan}</small>
                </div>
                <strong>{date(m.joined)}</strong>
              </button>
            );
          })}
          {!recent.length && (
            <div className="empty">
              <p>No members yet.</p>
            </div>
          )}
        </section>
      )}
      {section === "tip" && (
        <div className="dashboard-reminder-tip">
          <Lightbulb size={19} />
          <p>
            <strong>Keep renewals on track.</strong> Configure payment and
            membership reminders.
          </p>
          <button className="small-button" onClick={setup}>
            Set up reminders <ArrowUpRight size={14} />
          </button>
        </div>
      )}
    </>
  );
}
