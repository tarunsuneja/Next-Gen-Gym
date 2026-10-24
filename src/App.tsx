import { CollectionChart } from "./CollectionChart";
import { WhatsAppLink, welcomeMessage, receiptMessage } from "./WhatsAppActions";
import { CheckoutForm } from "./CheckoutForm";
import { DashboardShortcuts } from "./DashboardShortcuts";
import { PlanDistribution } from "./PlanDistribution";
import { ModalView } from "./ModalView";
import { MemberRegistration } from "./MemberRegistration";
import { MemberAvatar as Avatar } from "./MemberAvatar";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Dumbbell,
  Download,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Users,
  Wallet,
  X,
  RefreshCw,
  Receipt,
  Clock,
  Sun,
  Moon,
  ChevronLeft,
  Loader2,
  ShieldCheck,
  Archive,
  Undo2,
} from "lucide-react";
import {
  active,
  balance,
  date,
  expiry,
  id,
  latest,
  money,
  outstanding,
  shiftDay,
  today,
  type Data,
  type Member,
  type Attendance,
  type Reminder,
  type Payment,
  type Plan,
  type Membership,
  frozen,
  membershipStatus,
  overdue,
  memberErrors,
  normalizePhone,
} from "./domain";
import { EditMembershipPricing, discountTotal } from "./MembershipPricing";
import { MemberHighlights } from "./MemberHighlights";
import { GYM_NAME } from "./branding";
import {
  RANGES,
  Trend,
  chartBuckets,
  dashWindow,
  kolkataDay,
  type RangeKey,
} from "./analytics";
import { ValidatedForm } from "./Forms";
import {
  MemberFinder,
  AttentionQueue,
  LifecycleForm,
  Reports,
} from "./Operations";
import { Messaging } from "./Messaging";
import { StaffManager, AuditLog } from "./Admin";
import {
  liveAction,
  liveLoad,
  logExport,
  sendWhatsApp,
  supabase,
  type Action,
} from "./api";
import { friendlyError } from "./errors";
type Page =
  | "Dashboard"
  | "Members"
  | "Fees & receipts"
  | "Attendance"
  | "Reminders"
  | "Settings"
  | "Reports"
  | "Audit";
const nav: [Page, typeof Users][] = [
  ["Dashboard", LayoutDashboard],
  ["Members", Users],
  ["Fees & receipts", Wallet],
  ["Attendance", Activity],
  ["Reminders", MessageCircle],
  ["Settings", Settings],
  ["Reports", Receipt],
  ["Audit", ShieldCheck],
];
type Modal = {
  newRegistration?: boolean;
  kind: string;
  member?: Member;
  payment?: Payment;
  plan?: Plan;
  membership?: Membership;
  attendance?: Attendance;
  contact?: Reminder;
};
function exportCSV(filename: string, rows: (string | number)[][]) {
  const content =
    "\uFEFF" +
    rows
      .map((r) =>
        r
          .map(
            (c) =>
              '"' +
              String(c)
                .replace(/^[=+@-]/, "'")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
function Brand() {
  return (
    <>
      <img
        className="gym-logo"
        src="/ngf-logo.jpg"
        alt="Next Generation Fitness logo"
      />
      <span className="brand-name">
        Next Generation<span>Fitness Gym</span>
      </span>
    </>
  );
}
export default function App() {
  const [viewRange, setViewRange] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const mutationLock = useRef(false);
  const [messagingSection, setMessagingSection] = useState<"Queue" | "Setup">("Queue");
  const [collectionRange, setCollectionRange] = useState<RangeKey>("7");
  const [memberRequestId, setMemberRequestId] = useState(id);
  const [globalSearch, setGlobalSearch] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [refreshed, setRefreshed] = useState("");
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("ngf-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("ngf-sidebar-collapsed", String(collapsed));
    } catch {}
  }, [collapsed]);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem("ngf-theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch {}
    return matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("ngf-theme", theme);
    } catch {}
  }, [theme]);
  const themeButton = (
    <button
      className="theme-toggle"
      aria-label={
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
      title={
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
  const [data, setData] = useState<Data | null>(null),
    [session, setSession] = useState(false),
    [role, setRole] = useState("owner"),
    [page, setPage] = useState<Page>("Dashboard"),
    [query, setQuery] = useState(""),
    [attentionIds, setAttentionIds] = useState<string[]>([]),
    [filter, setFilter] = useState("All"),
    [modal, setModal] = useState<Modal | null>(null),
    [selected, setSelected] = useState<Member | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [menu, setMenu] = useState(false),
    [loginMode, setLoginMode] = useState("login"),
    [profileTab, setProfileTab] = useState("Overview"),
    [attendanceTab, setAttendanceTab] = useState("Check-in"),
    [reminderMode, setReminderMode] = useState("Manual"),
    [reminderDirty, setReminderDirty] = useState(false),
    [reminderSending, setReminderSending] = useState(false),
    [dashboardRange, setDashboardRange] = useState<RangeKey>("7");
  useEffect(() => {
    setError("");
    setMemberRequestId(id());
    if (modal) setToast("");
  }, [modal?.kind, modal?.member?.id]);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "k" &&
        data &&
        !modal
      ) {
        e.preventDefault();
        setGlobalSearch((s) => !s);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [data, modal]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (s: string) => {
    setToast(s);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  };
  function exportWithAudit(filename: string, rows: (string | number)[][]) {
    exportCSV(filename, rows);
    const kind = filename.split(/[-.]/)[0] || "export";
    void logExport(kind).catch((e) => console.error("Export audit failed:", e));
  }
  const authEpoch = useRef(0);
  async function load() {
    const epoch = authEpoch.current;
    setBusy(true);
    try {
      const [workspace, access] = await Promise.all([
        liveLoad(),
        supabase!.rpc("my_role"),
      ]);
      if (epoch !== authEpoch.current) return;
      if (access.error) throw access.error;
      if (access.data !== "owner" && access.data !== "reception")
        throw Error("No active gym access.");
      setRole(access.data);
      setData(workspace);
      setRefreshed(new Date().toISOString());
      setError("");
    } catch (e) {
      if (epoch !== authEpoch.current) return;
      setData(null);
      setSelected(null);
      setRole("reception");
      setError(friendlyError(e));
    } finally {
      if (epoch === authEpoch.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(!!data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(!!s);
      if (!s) {
        authEpoch.current++;
        setData(null);
        setSelected(null);
        setModal(null);
        setMenu(false);
        setGlobalSearch(false);
        setPage("Dashboard");
        setQuery("");
        setFilter("All");
        setViewRange(null);
        setRole("reception");
        setError("");
        setBusy(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (session) void load();
  }, [session]);
  useEffect(() => {
    setSelected((current) =>
      current && data
        ? data.members.find((m) => m.id === current.id) || null
        : current,
    );
  }, [data]);
  async function mutate(action: Action, message = "Saved successfully") {
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!online)
        throw Error("You are offline. Reconnect before saving changes.");
      const updated = await liveAction(action);
      setData(updated);
      setRefreshed(new Date().toISOString());
      setModal(null);
      flash(message);
      return updated;
    } catch (e) {
      setError(friendlyError(e));
      return false;
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }
  async function sendMessage(memberId: string, templateName: string) {
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!online)
        throw Error("You are offline. Reconnect before sending messages.");
      await sendWhatsApp({ memberId, templateName });
      await load();
      flash("Message sent");
      return true;
    } catch (e) {
      setError(friendlyError(e));
      return false;
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    setProfileTab("Overview");
  }, [selected?.id]);
  useEffect(() => {
    if (page === "Attendance" && viewRange) setAttendanceTab("History");
  }, [page, viewRange]);
  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      for (const menu of document.querySelectorAll<HTMLDetailsElement>(
        "details.action-menu[open]",
      )) {
        if (
          !menu.contains(target) ||
          target.closest(".action-menu-items button, .action-menu-items a")
        )
          menu.open = false;
      }
    };
    const escapeMenus = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      for (const menu of document.querySelectorAll<HTMLDetailsElement>(
        "details.action-menu[open]",
      )) {
        menu.open = false;
        menu.querySelector<HTMLElement>("summary")?.focus();
      }
    };
    document.addEventListener("click", closeMenus);
    document.addEventListener("keydown", escapeMenus);
    return () => {
      document.removeEventListener("click", closeMenus);
      document.removeEventListener("keydown", escapeMenus);
    };
  }, []);
  function canLeaveReminder() {
    if (page !== "Reminders") return true;
    if (reminderSending) { flash("Wait for reminder sending to finish before leaving this page."); return false; }
    return !reminderDirty || confirm("Discard unsaved reminder changes?");
  }
  useEffect(() => {
    if (page !== "Reminders" || (!reminderDirty && !reminderSending)) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [page, reminderDirty, reminderSending]);
  function navigate(p: Page) {
    if (!canLeaveReminder()) { setMenu(false); return false; }
    setReminderDirty(false);
    setViewRange(null);
    setAttendanceTab("Check-in");
    setReminderMode("Manual");
    setPage(p);
    setQuery("");
    setFilter("All");
    setSelected(null);
    setMenu(false);
    setError("");
  }
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (!supabase)
        throw Error(
          "Supabase is not connected yet. Add your project URL and publishable key to connect this workspace.",
        );
      const email = String(f.get("email"));
      const result =
        loginMode === "reset"
          ? await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: location.origin,
            })
          : await supabase.auth.signInWithPassword({
              email,
              password: String(f.get("password")),
            });
      if (result.error) throw result.error;
      if (loginMode === "reset") flash("Password reset email requested.");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setModal({ kind: "password" });
    });
    return () => subscription.unsubscribe();
  }, []);
  if (!session)
    return (
      <div className="login">
        <div className="login-theme">{themeButton}</div>
        <div className="login-art">
          <div className="brand">
            <Brand />
          </div>
          <div>
            <span className="eyebrow">YOUR GYM. IN GOOD SHAPE.</span>
            <h1>
              Less paperwork.
              <br />
              More progress.
            </h1>
            <p>
              Members, memberships, collections and attendance.
              <br />
              One organised workspace for your everyday.
            </p>
            <div className="login-metrics">
              <span>
                <Users />
                Members
              </span>
              <span>
                <Wallet />
                Collections
              </span>
              <span>
                <Activity />
                Attendance
              </span>
            </div>
          </div>
          <span className="login-foot">Built for the way your gym works.</span>
        </div>
        <div className="login-form">
          <div className="mobile-brand brand">
            <Brand />
          </div>
          <span className="eyebrow">WELCOME BACK</span>
          <h2>
            {loginMode === "reset"
              ? "Reset your password"
              : "Your day starts here."}
          </h2>
          <p className="muted">Sign in to your gym workspace.</p>
          <form onSubmit={login}>
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@gym.com"
              />
            </label>
            {loginMode === "login" && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                />
              </label>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? "Please wait…"
                : loginMode === "reset"
                  ? "Send reset link"
                  : "Sign in"}
              <ChevronRight size={18} />
            </button>
          </form>
          <button
            className="text-button"
            onClick={() =>
              setLoginMode(loginMode === "login" ? "reset" : "login")
            }
          >
            {loginMode === "login" ? "Forgot password?" : "Back to sign in"}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    );
  if (!data)
    return (
      <div className="loading">
        <Dumbbell />
        <h2>{error ? "Workspace needs setup" : "Opening your workspace…"}</h2>
        {error && (
          <>
            <p>{error}</p>
            <p>
              Follow the Supabase setup guide to provision your gym and staff
              account.
            </p>
            <button onClick={load}>Retry</button>
            <button onClick={() => supabase!.auth.signOut()}>Sign out</button>
          </>
        )}
      </div>
    );
  const d = data,
    t = today(),
    currentMembers = d.members.filter((m) => !m.archived),
    activeCount = currentMembers.filter((m) => active(d, m)).length,
    pending = d.members.reduce((a, m) => a + balance(d, m.id), 0),
    todayPayments = d.payments.filter(
      (p) =>
        !p.voided &&
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(p.at)) === t,
    ),
    soon = currentMembers.filter((m) => {
      const s = latest(d, m.id);
      return s && s.end >= t && s.end <= shiftDay(t, 7);
    }),
    checkins = d.attendance.filter((a) => a.day === t);
  const dashWin = dashWindow(dashboardRange, t),
    validPayments = d.payments.filter((p) => !p.voided),
    inWindow = (day: string) => day >= dashWin.from && day <= dashWin.to,
    inPrevWindow = (day: string) =>
      day >= dashWin.prevFrom && day <= dashWin.prevTo,
    cashIn = (test: (day: string) => boolean) =>
      validPayments
        .filter((p) => test(kolkataDay(p.at)))
        .reduce((a, p) => a + p.amount, 0),
    joinsIn = (test: (day: string) => boolean) =>
      d.members.filter((m) => test(m.joined)).length,
    visitsIn = (test: (day: string) => boolean) =>
      d.attendance.filter((a) => test(a.day)).length,
    rangeCash = cashIn(inWindow),
    prevCash = cashIn(inPrevWindow),
    rangeJoins = joinsIn(inWindow),
    prevJoins = joinsIn(inPrevWindow),
    rangeVisits = visitsIn(inWindow),
    prevVisits = visitsIn(inPrevWindow),
    rangePayments = validPayments.filter((p) => inWindow(kolkataDay(p.at))),
    chart = chartBuckets(collectionRange, t, validPayments, kolkataDay),
    chartTotal = chart.buckets.reduce((a, b) => a + b.total, 0);
  const filtered = d.members
    .filter((m) =>
      `${m.name} ${m.phone} ${m.id}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .filter(
      (m) =>
        filter === "All" ||
        ((filter.startsWith("Attention: ") || filter.startsWith("Plan: ")) && attentionIds.includes(m.id)) ||
        (filter === "Active" && active(d, m)) ||
        (filter === "Inactive" && !active(d, m)) ||
        (filter === "Expired" &&
          !m.archived &&
          !!latest(d, m.id) &&
          !latest(d, m.id).cancelled &&
          latest(d, m.id).end < t) ||
        (filter === "Pending fees" && balance(d, m.id) > 0) ||
        (filter === "Overdue" && overdue(d, m.id) > 0) ||
        (filter === "Expiring soon" && soon.some((x) => x.id === m.id)) ||
        (filter === "Joined in range" &&
          !!viewRange &&
          m.joined >= viewRange.from &&
          m.joined <= viewRange.to) ||
        (filter === "Archived" && m.archived),
    )
    .sort(
      (a, b) =>
        b.joined.localeCompare(a.joined) || a.name.localeCompare(b.name),
    );
  const memberName = (memberId: string) =>
    d.members.find((m) => m.id === memberId)?.name || "Unknown member";
  const visiblePayments = (
    viewRange
      ? d.payments.filter(
          (p) =>
            !p.voided &&
            kolkataDay(p.at) >= viewRange.from &&
            kolkataDay(p.at) <= viewRange.to,
        )
      : filter === "Today"
        ? todayPayments
        : d.payments
  ).filter((p) =>
    (memberName(p.memberId) + " " + p.receipt)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const visibleAttendance = viewRange
    ? d.attendance.filter(
        (a) => a.day >= viewRange.from && a.day <= viewRange.to,
      )
    : checkins;
  const attendanceRows = (
    attendanceTab === "Inside"
      ? checkins.filter((a) => !a.outAt)
      : viewRange
        ? visibleAttendance
        : d.attendance
  ).filter((a) =>
    `${memberNameForAttendance(a.memberId)}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  function memberNameForAttendance(memberId: string) {
    const m = d.members.find((m) => m.id === memberId);
    return m ? `${m.name} ${m.phone}` : "";
  }
  const memberRows = (list: Member[], mode = "normal") => (
    <Paginated
      records={list}
      label="members"
      render={(list) => (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                {page === "Members" && <th>Joining date</th>}
                <th>Membership</th>
                <th>Expiry</th>
                <th>{mode === "attendance" ? "Today" : "Balance"}</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const s =
                    d.memberships.find(
                      (x) =>
                        x.memberId === m.id &&
                        !x.cancelled &&
                        x.start <= t &&
                        x.end >= t,
                    ) || latest(d, m.id),
                  b = balance(d, m.id),
                  checked = checkins.find((a) => a.memberId === m.id);
                return (
                  <tr key={m.id}>
                    <td data-label="Member">
                      <button
                        className="member-cell"
                        onClick={() => setSelected(m)}
                      >
                        <Avatar name={m.name} photo={m.photo} />
                        <span>
                          <strong>{m.name}</strong>
                          <small>{m.phone}</small>
                        </span>
                      </button>
                    </td>
                    {page === "Members" && (
                      <td data-label="Joining date">{date(m.joined)}</td>
                    )}
                    <td data-label="Membership">{s?.planName || "No plan"}</td>
                    <td data-label="Expiry">{s ? date(s.end) : "—"}</td>
                    <td
                      data-label={mode === "attendance" ? "Today" : "Balance"}
                    >
                      {mode === "attendance" ? (
                        checked ? (
                          <Badge tone={checked.outAt ? "neutral" : "green"}>
                            {checked.outAt ? "Checked out" : "Inside"}
                          </Badge>
                        ) : (
                          "—"
                        )
                      ) : (
                        <span className={b ? "amount-due" : ""}>
                          {b ? money(b) : "Paid up"}
                        </span>
                      )}
                    </td>
                    <td data-label="Status">
                      <Badge
                        tone={
                          active(d, m)
                            ? "green"
                            : m.archived
                              ? "neutral"
                              : s?.start && s.start > t
                                ? "blue"
                                : "amber"
                        }
                      >
                        {m.archived
                          ? "Archived"
                          : active(d, m)
                            ? "Active"
                            : s && frozen(s)
                              ? "Frozen"
                              : s?.start && s.start > t
                                ? "Upcoming"
                                : s
                                  ? "Expired"
                                  : "No membership"}
                      </Badge>
                    </td>
                    <td className="row-action">
                      {mode === "attendance" ? (
                        <button
                          className="small-button"
                          disabled={!!checked?.outAt || busy}
                          onClick={() => {
                            if (checked)
                              void mutate(
                                {
                                  type: "checkout",
                                  payload: { id: checked.id },
                                },
                                "Member checked out",
                              );
                            else if (active(d, m))
                              void mutate(
                                {
                                  type: "attendance",
                                  payload: { memberId: m.id },
                                },
                                "Check-in recorded",
                              );
                            else setModal({ kind: "override", member: m });
                          }}
                        >
                          {checked?.outAt ? (
                            <Check size={16} />
                          ) : checked ? (
                            <LogOut size={16} />
                          ) : (
                            <Plus size={16} />
                          )}{" "}
                          {checked?.outAt
                            ? "Done"
                            : checked
                              ? "Check out"
                              : "Check in"}
                        </button>
                      ) : (
                        <>
                          {page === "Members" && (
                            <button
                              className="small-button"
                              disabled={m.archived}
                              onClick={() => openMembership(m)}
                            >
                              {s ? "Renew" : "Add membership"}
                            </button>
                          )}
                          <button
                            className="icon-button"
                            aria-label={"Open " + m.name}
                            onClick={() => setSelected(m)}
                          >
                            <ChevronRight size={18} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!list.length && <Empty text="No members match this view." />}
        </div>
      )}
    />
  );
  const paymentsTable = (payments: Payment[]) => (
    <Paginated
      records={payments}
      label="payments"
      render={(payments) => (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Member</th>
                <th>Date</th>
                <th>Method</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td data-label="Receipt">
                    <span className="receipt-number">{p.receipt}</span>
                    {p.voided && <Badge tone="red">Voided</Badge>}
                  </td>
                  <td data-label="Member"><span className="member-identity"><Avatar name={memberName(p.memberId)} photo={d.members.find(m=>m.id===p.memberId)?.photo}/><span>{memberName(p.memberId)}</span></span></td>
                  <td data-label="Date">{date(p.at)}</td>
                  <td data-label="Method">
                    <Badge>{p.method}</Badge>
                  </td>
                  <td data-label="Amount">
                    <strong>{money(p.amount)}</strong>
                  </td>
                  <td className="row-action">
                    <button
                      className="icon-button"
                      aria-label={"View receipt " + p.receipt}
                      onClick={() => setModal({ kind: "receipt", payment: p })}
                    >
                      <Receipt size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!payments.length && <Empty text="No payments recorded yet." />}
        </div>
      )}
    />
  );
  const openMembership = (m?: Member) =>
    setModal({ kind: "membership", member: m });
  async function saveForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      s = (key: string) => String(f.get(key) || ""),
      n = (key: string) => Number(f.get(key)),
      kind = modal!.kind;
    setError("");
    const receivedPayment = (amount: number) => {
      const method = s("method");
      if (amount > 0 && (!["Cash", "UPI", "Card", "Bank transfer"].includes(method) || (method !== "Cash" && !s("reference").trim()))) throw Error("Select the payment method and enter its transaction reference.");
      if (amount > 0 && Math.round(n("receivedAmount") * 100) !== amount) throw Error("The full payment amount is required.");
      return { amount, method: amount ? method : "Cash", reference: s("reference").trim(), requestId: s("paymentRequestId") };
    };
    try {
      if (kind === "member") {
        if (!s("name").trim()) throw Error("Enter the member’s full name.");
        const phone = normalizePhone(s("phone"));
        if (phone.length < 10 || phone.length > 15)
          throw Error(
            "Enter a valid phone number with country code if needed.",
          );
        if (
          (!modal?.member || normalizePhone(modal.member.phone) !== phone) &&
          d.members.some(
            (m) =>
              m.id !== modal?.member?.id && normalizePhone(m.phone) === phone,
          ) &&
          !f.get("sharedPhone")
        )
          throw Error(
            "Phone number already exists. Confirm it is a shared family number.",
          );
        const gender = s("gender"),
          address = s("address").trim(),
          height = s("height"),
          weight = s("weight");
        if (gender && gender !== "Male" && gender !== "Female")
          throw Error("Gender must be Male or Female.");
        if (height && (Number(height) < 50 || Number(height) > 300))
          throw Error("Height must be between 50 and 300 cm.");
        if (weight && (Number(weight) < 10 || Number(weight) > 500))
          throw Error("Weight must be between 10 and 500 kg.");
        if (f.get("addMembership") && !d.plans.some(p=>p.id===s("plan"))) throw Error("Choose a membership plan.");
        if (f.get("addMembership")) {
          discountTotal(Math.round(n("baseAmount") * 100), s("discountType"), n("discountValue"));
          if (!s("start") || !s("dueDate")) throw Error("Choose the membership start and due dates.");
        }
        const saved = await mutate(
          {
            type: "member",
            payload: {
              ...(f.get("addMembership") && !modal?.member ? { enrollment: {
                planId: s("plan"), start: s("start"),
                end: expiry(s("start"), d.plans.find(p=>p.id===s("plan"))!.months),
                amount: Math.round(n("amount")*100), baseAmount: Math.round(n("baseAmount")*100),
                discountType: s("discountType"), discountValue: n("discountValue"), dueDate: s("start"),
                payment: receivedPayment(Math.round(n("amount")*100)),
              }} : {}),
              id: modal?.member?.id,
              name: s("name").trim(),
              phone,
              email: s("email").trim(),
              sharedPhone: !!f.get("sharedPhone"),
              gender,
              address,
              height,
              weight,
              dob: s("dob"),
              photo: s("photo"),
              notes: s("notes"),
              joined: modal?.member?.joined || t,
              archived: modal?.member?.archived ?? false,
              whatsappConsent: modal?.member?.whatsappConsent ?? false,
            },
            requestId: memberRequestId,
          },
          "Member saved",
        );
        if (saved && !modal?.member) {
          setPage("Members");
          setQuery("");
          setFilter("All");
          setSelected(
            saved.members
              .slice()
              .reverse()
              .find((m) => m.name === s("name").trim() && m.phone === phone) ||
              null,
          );
          const receipt=saved.payments.find(p=>p.requestId===s("paymentRequestId"));
          if(receipt) setModal({kind:"receipt",payment:receipt,newRegistration:true});
          else { const member=saved.members.find(m=>m.name===s("name").trim() && m.phone===phone); if(member) setModal({kind:"welcome",member}); }
        }
      } else if (kind === "membership" || kind === "payment") {
        const selectedMember = d.members.find(m=>m.id===s("memberId"));
        if (!selectedMember) throw Error("Search for and select a member first.");
        const settling = s("checkoutMode") === "balance";
        let action: Action;
        if (settling) {
          const period = d.memberships.find(m=>m.id===s("membershipId") && m.memberId===selectedMember.id);
          if (!period || outstanding(d,period)<=0) throw Error("Select an outstanding membership.");
          const amount=outstanding(d,period);
          if (Math.round(n("amount")*100)!==amount) throw Error("Collect the full outstanding balance.");
          action={type:"payment",payload:{membershipId:period.id,...receivedPayment(amount)},requestId:s("paymentRequestId")};
        } else {
          const plan=d.plans.find(p=>p.id===s("plan"));
          if (!plan || selectedMember.archived) throw Error("Select an available member and membership plan.");
          const start=s("start"), amount=Math.round(n("amount")*100);
          if (!start) throw Error("Select the membership start date.");
          const calculated=discountTotal(Math.round(n("baseAmount")*100),s("discountType"),n("discountValue"));
          if (calculated.amount!==amount) throw Error("Review the membership price and discount.");
          if (d.memberships.some(m=>m.memberId===selectedMember.id&&!m.cancelled&&m.start<=expiry(start,plan.months)&&m.end>=start)) throw Error("These dates overlap an existing membership.");
          action={type:"membership",payload:{memberId:selectedMember.id,planId:plan.id,start,end:expiry(start,plan.months),amount,baseAmount:Math.round(n("baseAmount")*100),discountType:s("discountType"),discountValue:n("discountValue"),dueDate:start,payment:receivedPayment(amount)},requestId:s("requestId")};
        }
        const updated=await mutate(action,"Full payment recorded. Membership and receipt are ready.");
        if(updated){const receipt=updated.payments.find(p=>p.requestId===s("paymentRequestId"));if(receipt)setModal({kind:"receipt",payment:receipt});}
      } else if (kind === "membershipEdit") {
        await mutate(
          {
            type: "membershipEdit",
            payload: {
              id: modal!.membership!.id,
              planName: s("planName"),
              start: s("start"),
              end: s("end"),
              dueDate: s("dueDate"),
              amount: Math.round(n("amount") * 100),
              baseAmount: Math.round(n("baseAmount") * 100),
              discountType: s("discountType"),
              discountValue: n("discountValue"),
              reason: s("reason"),
            },
          },
          "Membership details updated",
        );
      } else if (["freeze", "resume", "cancel", "dueDate"].includes(kind)) {
        await mutate(
          {
            type: kind,
            payload: {
              id: modal!.membership!.id,
              start: s("start"),
              end: s("end"),
              reason: s("reason"),
              dueDate: s("dueDate"),
            },
          },
          "Membership updated",
        );
      } else if (kind === "contact") {
        await mutate(
          {
            type: "reminder",
            payload: {
              id: modal!.contact?.id,
              memberId: modal!.member!.id,
              kind: s("kind"),
              note: s("note"),
              nextDate: s("nextDate"),
            },
          },
          "Contact saved",
        );
      } else if (kind === "attendanceRemove") {
        await mutate(
          {
            type: "attendanceRemove",
            payload: { id: modal!.attendance!.id, reason: s("reason") },
          },
          "Check-in corrected. The original entry is retained in Audit.",
        );
      } else if (kind === "override") {
        if (role !== "owner")
          throw Error("Only an admin can override membership eligibility.");
        await mutate(
          {
            type: "attendance",
            payload: { memberId: modal!.member!.id, override: s("reason") },
          },
          "Check-in recorded with override",
        );
      } else if (kind === "void")
        await mutate(
          {
            type: "void",
            payload: { id: modal!.payment!.id, reason: s("reason") },
          },
          "Payment voided; outstanding balance restored",
        );
      else if (kind === "memberDelete") {
        if (role !== "owner") throw Error("Only an admin can delete a member.");
        if (!f.get("confirm")) throw Error("Confirm the deletion to continue.");
        const removed = await mutate(
          {
            type: "memberDelete",
            payload: { id: modal!.member!.id },
          },
          "Member deleted",
        );
        if (removed) setSelected(null);
      } else if (kind === "expire") {
        if (role !== "owner")
          throw Error("Only an admin can change membership access.");
        if (!s("endDate")) throw Error("Choose the day access should end.");
        if (s("reason").trim().length < 5)
          throw Error("Provide a reason of at least five characters.");
        await mutate(
          {
            type: "membershipExpire",
            payload: {
              id: modal!.membership!.id,
              endDate: s("endDate"),
              reason: s("reason"),
            },
          },
          "Membership access ended",
        );
      } else if (kind === "plan") {
        if (!s("name").trim()) throw Error("Enter a plan name.");
        await mutate(
          {
            type: "plan",
            payload: {
              ...(modal?.plan ? { id: modal.plan.id } : {}),
              name: s("name").trim(),
              months: n("months"),
              price: Math.round(n("price") * 100),
            },
          },
          modal?.plan
            ? "Plan updated; existing membership fees are preserved"
            : "Plan created",
        );
      } else if (kind === "settings") {
        if (!s("name").trim()) throw Error("Enter your gym name.");
        await mutate(
          {
            type: "settings",
            payload: {
              name: s("name").trim(),
              phone: s("phone").trim(),
              address: s("address").trim(),
            },
          },
          "Gym details updated",
        );
      } else if (kind === "password") {
        const { error } = await supabase!.auth.updateUser({
          password: s("password"),
        });
        if (error) throw error;
        setModal(null);
        flash("Password updated");
      }
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  return (
    <div className={collapsed ? "app sidebar-collapsed" : "app"}>
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <button
          className="sidebar-close icon-button"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        >
          <X size={20} />
        </button>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("Dashboard");
          }}
        >
          <Brand />
        </a>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {nav
            .filter(([p]) => p !== "Audit" || role === "owner")
            .map(([p, Icon]) => (
              <button
                key={p}
                aria-label={p}
                title={p}
                aria-current={page === p ? "page" : undefined}
                className={page === p ? "nav-item selected" : "nav-item"}
                onClick={() => navigate(p)}
              >
                <Icon size={19} />
                <span>{p}</span>
                {p === "Reminders" && soon.length > 0 && <b>{soon.length}</b>}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="pulse" />
            <span>
              Connected workspace
              <small>Asia/Kolkata · INR</small>
            </span>
          </div>
          <button
            className="staff"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => { if (canLeaveReminder()) void supabase!.auth.signOut(); }}
          >
            <Avatar name={role === "owner" ? "Gym Admin" : "Gym Staff"} />
            <span>
              <strong>{role === "owner" ? "Gym admin" : "Staff member"}</strong>
              <small>Sign out</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {menu && (
        <div className="sidebar-backdrop" onClick={() => setMenu(false)} />
      )}
      <main id="workspace">
        <header className="topbar">
          <button
            className="sidebar-toggle icon-button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            <Menu size={20} />
          </button>
          <button
            className="mobile-menu icon-button"
            aria-label="Open navigation"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <div className="workspace-status topbar-status">
            <span className={online ? "connection-good" : "connection-offline"}>
              {online ? "Connected" : "Offline · changes cannot be saved"}
            </span>
            <span>
              {refreshed
                ? `Updated ${new Date(refreshed).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </span>
          </div>
          <div className="topbar-right">
            <button
              className="global-search-trigger"
              aria-label="Open global search"
              title="Global search (Ctrl+K)"
              onClick={() => setGlobalSearch(true)}
            >
              <Search size={18} />
              <span>Search workspace</span>
              <kbd>Ctrl K</kbd>
            </button>
            <button
              className="icon-button"
              aria-label="Refresh workspace"
              disabled={busy}
              onClick={load}
            >
              <RefreshCw size={17} />
            </button>
            {themeButton}
            <span>
              <CalendarDays size={16} />
              {date(t)}
            </span>
            <span className="owner-pill">
              {role === "owner" ? "Admin" : "Staff"}
            </span>
          </div>
        </header>
        <div
          className={`workspace${page === "Dashboard" && !selected ? " dashboard-workspace" : ""}`}
        >
          <div
            className={`page-heading${selected ? " profile-page-heading" : ""}`}
          >
            <div>
              <h1>
                {selected
                  ? selected.name
                  : page === "Dashboard"
                    ? "Dashboard"
                    : page}
              </h1>
            </div>
            <div className="heading-actions">
              {selected ? (
                <button className="secondary" onClick={() => setSelected(null)}>
                  <ChevronLeft size={16} />
                  Back to {page}
                </button>
              ) : page === "Members" || page === "Dashboard" ? (
                <button
                  className="primary"
                  onClick={() => setModal({ kind: "member" })}
                >
                  <Plus size={18} />
                  Add member
                </button>
              ) : page === "Fees & receipts" ? (
                <button
                  className="primary"
                  onClick={() => setModal({ kind: "payment" })}
                >
                  <Plus size={18} />
                  Collect payment
                </button>
              ) : null}
            </div>
          </div>
          {viewRange &&
            !selected &&
            (page === "Fees & receipts" ||
              page === "Attendance" ||
              (page === "Members" && filter === "Joined in range")) && (
              <div className="filter-notice scoped-filter">
                <span>
                  Showing {date(viewRange.from)} – {date(viewRange.to)}
                </span>
                <button
                  className="text-button"
                  onClick={() => {
                    setViewRange(null);
                    setFilter("All");
                  }}
                >
                  Clear date filter
                </button>
              </div>
            )}
          {error && !modal && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {selected ? (
            <>
              <div className="profile-summary panel">
                <Avatar name={selected.name} photo={selected.photo} />
                <div>
                  <h2>{selected.name}</h2>
                  <p>
                    {selected.phone} {selected.email && " · " + selected.email}
                    {selected.address && (
                      <>
                        <br />
                        {selected.address}
                      </>
                    )}
                  </p>
                  <small>
                    Joined {date(selected.joined)}
                    {selected.dob && " · DOB " + date(selected.dob)}
                    {selected.gender && " · " + selected.gender}
                    {selected.height && " · " + selected.height + " cm"}
                    {selected.weight && " · " + selected.weight + " kg"}
                  </small>
                </div>
                <Badge tone={active(d, selected) ? "green" : "amber"}>
                  {selected.archived
                    ? "Archived"
                    : active(d, selected)
                      ? "Active"
                      : "Inactive"}
                </Badge>
                <div className="profile-actions">
                  <button
                    className="secondary"
                    onClick={() =>
                      setModal({ kind: "member", member: selected })
                    }
                  >
                    Edit member
                  </button>
                  <button
                    className="primary"
                    disabled={selected.archived}
                    onClick={() => openMembership(selected)}
                  >
                    <RefreshCw size={16} />
                    {latest(d, selected.id) ? "Renew" : "Add membership"}
                  </button>
                  <button
                    className="secondary"
                    disabled={selected.archived && !balance(d, selected.id)}
                    onClick={() =>
                      setModal({ kind: "payment", member: selected })
                    }
                  >
                    Collect payment
                  </button>
                  <details className="action-menu profile-more">
                    <summary>More actions</summary>
                    <div className="action-menu-items">
                      {selected.dob && (
                        <a
                          className="small-button"
                          target="_blank"
                          rel="noopener noreferrer"
                          href={`https://wa.me/${normalizePhone(selected.phone).length === 10 ? "91" : ""}${normalizePhone(selected.phone)}?text=${encodeURIComponent(`Happy Birthday, ${selected.name}! Wishing you health, strength and happiness. Best wishes from ${d.gym.name}!`)}`}
                        >
                          WhatsApp wishes
                        </a>
                      )}
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => {
                          const restore = selected.archived;
                          if (
                            confirm(
                              restore
                                ? `Restore ${selected.name} to the active member list?`
                                : `Archive ${selected.name}? They stay in the database and can be restored later. Financial history is kept.`,
                            )
                          )
                            void mutate(
                              {
                                type: "member",
                                payload: { ...selected, archived: !restore },
                              },
                              restore ? "Member restored" : "Member archived",
                            );
                        }}
                      >
                        {selected.archived ? (
                          <Undo2 size={16} />
                        ) : (
                          <Archive size={16} />
                        )}
                        {selected.archived ? "Restore" : "Archive"}
                      </button>
                      {role === "owner" && (
                        <button
                          className="danger-button"
                          onClick={() =>
                            setModal({ kind: "memberDelete", member: selected })
                          }
                        >
                          Delete member
                        </button>
                      )}
                    </div>
                  </details>
                </div>
              </div>
              <div
                className="tabs profile-tabs"
                role="tablist"
                aria-label="Member sections"
              >
                {["Overview", "Memberships", "Payments", "Attendance"].map(
                  (tab) => (
                    <button
                      key={tab}
                      role="tab"
                      aria-selected={profileTab === tab}
                      className={profileTab === tab ? "active" : ""}
                      onClick={() => setProfileTab(tab)}
                    >
                      {tab}
                    </button>
                  ),
                )}
              </div>
              {profileTab === "Overview" && (
                <div className="profile-overview">
                  <div className="profile-overview-cards">
                    <button
                      className="panel overview-card"
                      onClick={() => setProfileTab("Memberships")}
                    >
                      <CalendarDays size={19} />
                      <span>
                        Membership
                        <strong>
                          {latest(d, selected.id)?.planName || "No membership"}
                        </strong>
                        <small>
                          {latest(d, selected.id)
                            ? `Ends ${date(latest(d, selected.id)!.end)}`
                            : "Add a plan to get started"}
                        </small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    <button
                      className="panel overview-card"
                      onClick={() => setProfileTab("Payments")}
                    >
                      <Wallet size={19} />
                      <span>
                        Pending balance
                        <strong>{money(balance(d, selected.id))}</strong>
                        <small>Payments & receipts</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    <button
                      className="panel overview-card"
                      onClick={() => setProfileTab("Attendance")}
                    >
                      <Activity size={19} />
                      <span>
                        Attendance
                        <strong>
                          {
                            d.attendance.filter(
                              (a) => a.memberId === selected.id,
                            ).length
                          }{" "}
                          visits
                        </strong>
                        <small>View visit history</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  <section className="panel">
                    <div className="panel-header">
                      <h2>Contact history</h2>
                      <button
                        className="small-button"
                        onClick={() =>
                          setModal({ kind: "contact", member: selected })
                        }
                      >
                        Log contact
                      </button>
                    </div>
                    <div className="record-scroll" role="region" aria-label="Contact history" tabIndex={0}>
{d.reminders
                      .filter((x) => x.memberId === selected.id)
                      .slice()
                      .reverse()
                      .slice(0, 10)
                      .map((x) => (
                        <div
                          className="list-item contact-history-entry"
                          key={x.id}
                        >
                          <div>
                            <strong>
                              {x.kind} · {date(x.at)}
                            </strong>
                            <small>{x.note || "Contact recorded"}</small>
                          </div>
                          <button
                            className="small-button"
                            aria-label={`Edit contact ${x.id}`}
                            onClick={() =>
                              setModal({
                                kind: "contact",
                                member: selected,
                                contact: x,
                              })
                            }
                          >
                            Edit contact
                          </button>
                        </div>
                      ))}
</div>
                    {!d.reminders.some((x) => x.memberId === selected.id) && (
                      <Empty text="No contact logged yet." />
                    )}
                  </section>
                  {selected.notes && (
                    <section className="panel notes">
                      <h2>Member notes</h2>
                      <p>{selected.notes}</p>
                    </section>
                  )}
                </div>
              )}
              {profileTab === "Memberships" && (
                <>
                  {" "}
                  <section className="panel">
                    <div className="panel-header">
                      <h2>Membership history</h2>
                      <strong>{money(balance(d, selected.id))} pending</strong>
                    </div>
                    {d.memberships
                      .filter((m) => m.memberId === selected.id)
                      .sort((a, b) => b.start.localeCompare(a.start))
                      .map((m) => (
                        <div
                          className="list-item membership-history-entry"
                          key={m.id}
                        >
                          <span className="list-icon">
                            <CalendarDays size={20} />
                          </span>
                          <div>
                            <strong>{m.planName}</strong>
                            <small>
                              {date(m.start)} – {date(m.end)}
                            </small>
                          </div>
                          <span>
                            {money(m.amount)}
                            {!!m.discount && (
                              <small>
                                {money(m.baseAmount ?? m.amount)} less{" "}
                                {money(m.discount)} discount
                              </small>
                            )}
                            <small>{money(outstanding(d, m))} pending</small>
                            <small>
                              {membershipStatus(m)} ·{" "}
                              {m.dueDate
                                ? `Payment due ${date(m.dueDate)}`
                                : "Payment due date not set"}
                            </small>
                            {m.freezeStart && m.freezeEnd && (
                              <small>
                                Freeze {date(m.freezeStart)} –{" "}
                                {date(m.freezeEnd)}
                              </small>
                            )}
                            {m.cancelled && (
                              <small>Reason: {m.cancelReason}</small>
                            )}
                          </span>
                          {role === "owner" && (
                            <div className="membership-controls">
                              {!m.cancelled && (
                                <button
                                  className="small-button"
                                  onClick={() =>
                                    setModal({
                                      kind: "membershipEdit",
                                      membership: m,
                                    })
                                  }
                                >
                                  Edit membership
                                </button>
                              )}
                              {!m.cancelled && (
                                <details className="action-menu">
                                  <summary>More</summary>
                                  <div className="action-menu-items">
                                    <button
                                      className="small-button"
                                      onClick={() =>
                                        setModal({
                                          kind: "cancel",
                                          membership: m,
                                        })
                                      }
                                    >
                                      Cancel membership
                                    </button>
                                  </div>
                                </details>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    {!d.memberships.some((m) => m.memberId === selected.id) && (
                      <Empty text="No membership yet. Add one to get started." />
                    )}
                  </section>
                </>
              )}
              {profileTab === "Payments" && (
                <>
                  {" "}
                  <section className="panel">
                    <div className="panel-header">
                      <h2>Payment history</h2>
                    </div>
                    {paymentsTable(
                      d.payments
                        .filter((p) => p.memberId === selected.id)
                        .slice()
                        .reverse(),
                    )}
                  </section>
                </>
              )}
              {profileTab === "Attendance" && (
                <>
                  {" "}
                  <section className="panel">
                    <div className="panel-header">
                      <h2>
                        Attendance history{" "}
                        <small className="section-caption">
                          Latest 30 visits
                        </small>
                      </h2>
                      <Badge>
                        {
                          d.attendance.filter((a) => a.memberId === selected.id)
                            .length
                        }{" "}
                        visits
                      </Badge>
                    </div>
                    <div className="record-scroll" role="region" aria-label="Member attendance history" tabIndex={0}>
{d.attendance
                      .filter((a) => a.memberId === selected.id)
                      .slice()
                      .reverse()
                      .slice(0, 30)
                      .map((a) => (
                        <div className="list-item attendance-entry" key={a.id}>
                          <CheckCircle2 size={20} />
                          <div>
                            <strong>{date(a.day)}</strong>
                            <small>
                              {new Date(a.at).toLocaleTimeString("en-IN", {
                                timeZone: "Asia/Kolkata",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {a.override && " · Override: " + a.override}
                            </small>
                          </div>
                          <VisitCheckout
                            visit={a}
                            busy={busy}
                            checkout={() =>
                              void mutate(
                                { type: "checkout", payload: { id: a.id } },
                                "Member checked out",
                              )
                            }
                          />
                          {role === "owner" && (
                            <button
                              className="small-button"
                              onClick={() =>
                                setModal({
                                  kind: "attendanceRemove",
                                  attendance: a,
                                })
                              }
                            >
                              Correct check-in
                            </button>
                          )}
                        </div>
                      ))}
</div>
                    {!d.attendance.some((a) => a.memberId === selected.id) && (
                      <Empty text="No check-ins recorded." />
                    )}
                  </section>
                </>
              )}
            </>
          ) : page === "Dashboard" ? (
            <>
              <div
                className="tabs range-tabs"
                aria-label="Dashboard time range"
              >
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    className={dashboardRange === r.key ? "active" : ""}
                    aria-pressed={dashboardRange === r.key}
                    onClick={() => setDashboardRange(r.key)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="stats-grid dashboard-metrics">
                <Stat
                  title="Collections"
                  onClick={() => {
                    navigate("Fees & receipts");
                    setFilter(dashboardRange === "today" ? "Today" : "All");
                    setViewRange({ from: dashWin.from, to: dashWin.to });
                  }}
                  value={money(rangeCash)}
                  icon={<Wallet />}
                  note={
                    <>
                      {rangePayments.length}{" "}
                      {rangePayments.length === 1 ? "payment" : "payments"}
                      <Trend
                        now={rangeCash}
                        prev={prevCash}
                        label={dashWin.note}
                      />
                    </>
                  }
                  accent="blue"
                />
                <Stat
                  title="Pending fees"
                  onClick={() => {
                    navigate("Members");
                    setFilter("Pending fees");
                  }}
                  value={money(pending)}
                  icon={<CreditCard />}
                  note={`Current · ${d.members.filter((m) => balance(d, m.id) > 0).length} members with a balance`}
                  accent="amber"
                />
                <Stat title="Expiring in 7 days" value={String(soon.length)} icon={<CalendarDays />} note="Upcoming membership renewals" accent="violet" onClick={()=>{navigate("Members");setFilter("Expiring soon");}}/>
                <Stat
                  title="Today's check-ins"
                  value={String(checkins.length)}
                  icon={<Activity />}
                  note={`${checkins.filter(a=>!a.outAt).length} inside now · ${checkins.filter(a=>!!a.outAt).length} checked out`}
                  accent="blue"
                  onClick={()=>{
                    navigate("Attendance");
                    setAttendanceTab("History");
                    setViewRange({from:t,to:t});
                  }}
                />
                <Stat
                  title="Active members"
                  onClick={() => {
                    navigate("Members");
                    setFilter("Active");
                  }}
                  value={String(activeCount)}
                  icon={<Users />}
                  note={`Current · ${currentMembers.length} members in your gym`}
                  accent="teal"
                />
                <MemberHighlights
                  variant="movement"
                  data={d}
                  open={(memberId) => {
                    navigate("Members");
                    setSelected(
                      d.members.find((m) => m.id === memberId) || null,
                    );
                  }}
                />
              </div>
              <div className="dashboard-board">
                <DashboardShortcuts section="actions" data={d}
                  add={()=>setModal({kind:"member"})}
                  collect={()=>setModal({kind:"payment"})}
                  pending={()=>{navigate("Members");setFilter("Pending fees");}}
                  attendance={()=>navigate("Attendance")}
                  members={()=>navigate("Members")}
                  open={member=>{navigate("Members");setSelected(member);}}
                  setup={()=>{navigate("Reminders");setMessagingSection("Setup");setReminderMode("Automated");}}
                />
                <section className="panel collection-panel">
                  <div className="panel-header">
                    <div>
                      <h2>Collections</h2>
                      <p>
                        {collectionRange === "today"
                          ? "Hourly collections"
                          : "Daily collections"}
                      </p>
                    </div>
                    <select aria-label="Collection chart period" value={collectionRange} onChange={e=>setCollectionRange(e.target.value as RangeKey)}>{RANGES.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}</select>
                  </div>
                  <div className="chart-summary">
                    <strong>{money(chartTotal)}</strong>
                    <span>collected in this range</span>
                  </div>
                  {chartTotal === 0 ? <Empty text="No collections in this period." /> : <CollectionChart key={collectionRange} buckets={chart.buckets} range={collectionRange} activeKey={chart.activeKey}/>}
                </section>
                <PlanDistribution data={d} open={(name, ids)=>{navigate("Members");setAttentionIds(ids);setFilter(`Plan: ${name}`);}}/>
                <DashboardShortcuts section="pending" data={d}
                  add={()=>setModal({kind:"member"})}
                  collect={()=>setModal({kind:"payment"})}
                  pending={()=>{navigate("Members");setFilter("Pending fees");}}
                  attendance={()=>navigate("Attendance")}
                  members={()=>navigate("Members")}
                  open={member=>{navigate("Members");setSelected(member);}}
                  setup={()=>{navigate("Reminders");setMessagingSection("Setup");setReminderMode("Automated");}}
                />
                <section className="panel dashboard-recent-payments">
                  <div className="panel-header">
                    <h2>Recent payments</h2>
                    <button
                      className="text-button"
                      onClick={() => navigate("Fees & receipts")}
                    >
                      View all <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {d.payments
                    .filter((p) => !p.voided)
                    .slice()
                    .sort((a,b)=>b.at.localeCompare(a.at))
                    .slice(0, 5)
                    .map((p) => (
                      <div className="list-item" key={p.id}>
                        <Avatar name={memberName(p.memberId)} photo={d.members.find((m) => m.id === p.memberId)?.photo} />
                        <div>
                          <strong>{memberName(p.memberId)}</strong>
                          <small>
                            {p.receipt} · {p.method}
                          </small>
                        </div>
                        <strong>{money(p.amount)}</strong>
                      </div>
                    ))}
                  {!d.payments.some(p=>!p.voided) && (
                    <Empty text="Your first collection will appear here." />
                  )}
                </section>
                <AttentionQueue
                  data={d}
                  open={(m) => {
                    navigate("Members");
                    setSelected(m);
                  }}
                  pay={(m) => setModal({ kind: "payment", member: m })}
                  renew={(m) => openMembership(m)}
                  viewAll={(category, ids) => {
                    navigate("Members");
                    setAttentionIds(ids);
                    setFilter(`Attention: ${category}`);
                  }}
                />
                <DashboardShortcuts section="members" data={d}
                  add={()=>setModal({kind:"member"})}
                  collect={()=>setModal({kind:"payment"})}
                  pending={()=>{navigate("Members");setFilter("Pending fees");}}
                  attendance={()=>navigate("Attendance")}
                  members={()=>navigate("Members")}
                  open={member=>{navigate("Members");setSelected(member);}}
                  setup={()=>{navigate("Reminders");setMessagingSection("Setup");setReminderMode("Automated");}}
                />
                <MemberHighlights
                  variant="birthdays"
                  data={d}
                  open={(memberId) => {
                    navigate("Members");
                    setSelected(
                      d.members.find((m) => m.id === memberId) || null,
                    );
                  }}
                />
                <DashboardShortcuts section="tip" data={d}
                  add={()=>setModal({kind:"member"})}
                  collect={()=>setModal({kind:"payment"})}
                  pending={()=>{navigate("Members");setFilter("Pending fees");}}
                  attendance={()=>navigate("Attendance")}
                  members={()=>navigate("Members")}
                  open={member=>{navigate("Members");setSelected(member);}}
                  setup={()=>{navigate("Reminders");setMessagingSection("Setup");setReminderMode("Automated");}}
                />
              </div>
            </>
          ) : page === "Members" ? (
            <section className="panel">
              <div className="toolbar">
                <SearchField
                  query={query}
                  setQuery={setQuery}
                  placeholder="Search name, phone or member ID"
                />
                <div className="toolbar-actions">
                  {role === "owner" && (
                    <button
                      className="small-button"
                      onClick={() => navigate("Settings")}
                    >
                      Manage plans
                    </button>
                  )}

                  <select
                    aria-label="Member status filter"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    {(filter.startsWith("Attention: ") || filter.startsWith("Plan: ")) && <option value={filter}>{filter}</option>}
                    {[
                      "All",
                      "Active",
                      "Inactive",
                      "Expired",
                      "Pending fees",
                      "Overdue",
                      "Expiring soon",
                      "Archived",
                      ...(viewRange ? ["Joined in range"] : []),
                    ].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <button
                    className="secondary"
                    onClick={() =>
                      exportWithAudit("members.csv", [
                        [
                          "Name",
                          "Phone",
                          "Email",
                          "Gender",
                          "Address",
                          "Height (cm)",
                          "Weight (kg)",
                          "Joined",
                          "Status",
                          "Pending INR",
                        ],
                        ...filtered.map((m) => [
                          m.name,
                          m.phone,
                          m.email,
                          m.gender,
                          m.address,
                          m.height,
                          m.weight,
                          m.joined,
                          active(d, m) ? "Active" : "Inactive",
                          balance(d, m.id) / 100,
                        ]),
                      ])
                    }
                  >
                    <Download size={16} />
                    Export
                  </button>
                </div>
              </div>
              {memberRows(filtered)}
              <div className="table-footer">
                {filtered.length} members{" "}
                <span>
                  {activeCount} active · {d.members.length - activeCount}{" "}
                  inactive
                </span>
              </div>
            </section>
          ) : page === "Fees & receipts" ? (
            <>
              <div className="mini-stats">
                <span>
                  <b>
                    {money(todayPayments.reduce((a, p) => a + p.amount, 0))}
                  </b>{" "}
                  Collected today
                </span>
                <span>
                  <b>{money(pending)}</b> Pending fees
                </span>
                <span>
                  <b>{d.payments.filter((p) => !p.voided).length}</b> Payments
                  recorded
                </span>
              </div>
              <section className="panel">
                <div className="toolbar">
                  <SearchField
                    query={query}
                    setQuery={setQuery}
                    placeholder="Search member or receipt"
                  />
                  <button
                    className="secondary"
                    onClick={() =>
                      exportWithAudit("payments.csv", [
                        [
                          "Receipt",
                          "Member",
                          "Date",
                          "Method",
                          "Amount INR",
                          "Status",
                        ],
                        ...visiblePayments.map((p) => [
                          p.receipt,
                          memberName(p.memberId),
                          p.at,
                          p.method,
                          p.amount / 100,
                          p.voided ? "Voided" : "Valid",
                        ]),
                      ])
                    }
                  >
                    <Download size={16} />
                    Export
                  </button>
                </div>
                {filter === "Today" && !viewRange && (
                  <div className="filter-notice">
                    Showing today's payments
                    <button
                      className="text-button"
                      onClick={() => setFilter("All")}
                    >
                      Show all
                    </button>
                  </div>
                )}
                {paymentsTable(visiblePayments.slice().reverse())}
              </section>
              <section className="panel">
                <div className="panel-header">
                  <h2>Outstanding balances</h2>
                </div>
                {memberRows(d.members.filter((m) => balance(d, m.id) > 0))}
              </section>
            </>
          ) : page === "Attendance" ? (
            <>
              <div className="mini-stats">
                <span>
                  <b>{checkins.length}</b> Check-ins today
                </span>
                <span>
                  <b>{checkins.filter((a) => !a.outAt).length}</b> Inside now
                </span>
                <span>
                  <b>{checkins.filter((a) => !!a.outAt).length}</b> Checked out
                </span>
                <button
                  className="secondary"
                  onClick={() =>
                    exportWithAudit("attendance.csv", [
                      [
                        "Member",
                        "Date",
                        "Check-in",
                        "Check-out",
                        "Duration minutes",
                        "Override",
                      ],
                      ...(attendanceTab === "Check-in"
                        ? d.attendance
                        : attendanceRows
                      ).map((a) => [
                        memberName(a.memberId),
                        a.day,
                        a.at,
                        a.outAt || "",
                        a.outAt
                          ? Math.max(
                              0,
                              Math.round(
                                (Date.parse(a.outAt) - Date.parse(a.at)) /
                                  60000,
                              ),
                            )
                          : "",
                        a.override,
                      ]),
                    ])
                  }
                >
                  <Download size={16} />
                  {attendanceTab === "Inside"
                    ? "Export inside"
                    : "Export history"}
                </button>
              </div>
              <div
                className="tabs attendance-tabs"
                role="tablist"
                aria-label="Attendance sections"
              >
                {["Check-in", "Inside", "History"].map((tab) => (
                  <button
                    role="tab"
                    aria-selected={attendanceTab === tab}
                    className={attendanceTab === tab ? "active" : ""}
                    key={tab}
                    onClick={() => {
                      setAttendanceTab(tab);
                      setQuery("");
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {attendanceTab === "Check-in" && (
                <>
                  <section className="panel">
                    <div className="toolbar">
                      <SearchField
                        query={query}
                        setQuery={setQuery}
                        placeholder="Find a member to check in"
                      />
                      <Badge>Manual check-in</Badge>
                    </div>
                    {memberRows(
                      filtered.filter(
                        (m) =>
                          !m.archived &&
                          !checkins.some((a) => a.memberId === m.id),
                      ),
                      "attendance",
                    )}
                  </section>
                </>
              )}
              {attendanceTab !== "Check-in" && (
                <>
                  <section className="panel">
                    <div className="panel-header">
                      <h2>
                        {attendanceTab === "Inside"
                          ? "Currently inside"
                          : viewRange
                            ? "Visits in range"
                            : "Attendance history"}
                      </h2>
                      <Badge>{attendanceRows.length} visits</Badge>
                    </div>
                    <div className="toolbar">
                      <SearchField
                        query={query}
                        setQuery={setQuery}
                        placeholder={
                          attendanceTab === "Inside"
                            ? "Search members inside"
                            : "Search visit history"
                        }
                      />
                    </div>
                    <div className="record-scroll" role="region" aria-label="Attendance records" tabIndex={0}>
{attendanceRows
                      .slice()
                      .reverse()
                      .map((a) => (
                        <div className="list-item attendance-entry" key={a.id}>
                          <Avatar name={memberName(a.memberId)} photo={d.members.find(m=>m.id===a.memberId)?.photo} />
                          <div>
                            <strong>{memberName(a.memberId)}</strong>
                            <small>
                              {a.override
                                ? "Override: " + a.override
                                : "Valid membership"}
                            </small>
                          </div>
                          <span>
                            {new Date(a.at).toLocaleTimeString("en-IN", {
                              timeZone: "Asia/Kolkata",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <VisitCheckout
                            visit={a}
                            busy={busy}
                            checkout={() =>
                              void mutate(
                                { type: "checkout", payload: { id: a.id } },
                                "Member checked out",
                              )
                            }
                          />
                          {role === "owner" && (
                            <button
                              className="small-button"
                              onClick={() =>
                                setModal({
                                  kind: "attendanceRemove",
                                  attendance: a,
                                })
                              }
                            >
                              Correct check-in
                            </button>
                          )}
                        </div>
                      ))}
</div>
                    {!attendanceRows.length && (
                      <Empty
                        text={
                          attendanceTab === "Inside"
                            ? "No members are currently inside."
                            : "No visits match this view."
                        }
                      />
                    )}
                  </section>
                </>
              )}
            </>
          ) : page === "Reminders" ? (
            <>
              <div
                className="tabs reminder-workspace-tabs"
                role="tablist"
                aria-label="Reminder workspace"
              >
                {["Manual", "Automated", "Delivery log"].map((tab) => (
                  <button
                    role="tab"
                    aria-selected={reminderMode === tab}
                    className={reminderMode === tab ? "active" : ""}
                    disabled={busy || reminderSending}
                    key={tab}
                    onClick={() => {
                      if (
                        reminderMode !== tab &&
                        reminderDirty &&
                        !confirm("Discard unsaved reminder changes?")
                      )
                        return;
                      setReminderDirty(false);
                      setReminderMode(tab);
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {reminderMode === "Manual" ? (
                <>
                  <div className="tabs" aria-label="Reminder categories">
                    {["Expiring soon", "Expired", "Pending fees"].map((x) => (
                      <button
                        className={
                          (filter === "All" ? "Expiring soon" : filter) === x
                            ? "active"
                            : ""
                        }
                        key={x}
                        aria-pressed={
                          (filter === "All" ? "Expiring soon" : filter) === x
                        }
                        onClick={() => setFilter(x)}
                      >
                        {x}
                      </button>
                    ))}
                  </div>
                  <section className="panel">
                    <div className="panel-header">
                      <h2>{filter === "All" ? "Expiring soon" : filter}</h2>
                      <Badge>Manual WhatsApp</Badge>
                    </div>
                    <div className="record-scroll" role="region" aria-label="Manual reminder members" tabIndex={0}>
{currentMembers
                      .filter((m) =>
                        filter === "Pending fees"
                          ? balance(d, m.id) > 0
                          : filter === "Expired"
                            ? (latest(d, m.id)?.end || "9999") < t
                            : soon.some((x) => x.id === m.id),
                      )
                      .map((m) => {
                        const s = latest(d, m.id);
                        const logs = d.reminders.filter(
                          (x) => x.memberId === m.id,
                        );
                        return (
                          <div className="reminder-row" key={m.id}>
                            <Avatar name={m.name} photo={m.photo} />
                            <div>
                              <strong>{m.name}</strong>
                              <small>
                                {filter === "Pending fees"
                                  ? money(balance(d, m.id)) + " pending"
                                  : s
                                    ? "Membership expires " + date(s.end)
                                    : "No membership"}
                                {logs.length > 0 &&
                                  " · Last contacted " +
                                    date(logs[logs.length - 1].at)}
                              </small>
                            </div>
                            {m.whatsappConsent ? (
                              <a
                                className="whatsapp-button"
                                target="_blank"
                                rel="noreferrer"
                                href={
                                  "https://wa.me/" +
                                  (m.phone.length === 10 ? "91" : "") +
                                  m.phone +
                                  "?text=" +
                                  encodeURIComponent(
                                    `Hi ${m.name}, this is ${d.gym.name}. ${filter === "Pending fees" ? `Your outstanding membership balance is ${money(balance(d, m.id))}.` : `Your membership ${s && s.end < t ? "expired" : "expires"} on ${s ? date(s.end) : "your expiry date"}.`} Please contact us ${filter === "Pending fees" ? "to complete your payment" : "to renew"}. Thank you!`,
                                  )
                                }
                              >
                                <MessageCircle size={17} />
                                Open WhatsApp
                              </a>
                            ) : (
                              <span className="badge">
                                WhatsApp consent not recorded
                              </span>
                            )}
                            <button
                              className="small-button"
                              disabled={busy}
                              onClick={() =>
                                setModal({ kind: "contact", member: m })
                              }
                            >
                              <Check size={15} />
                              Log contact
                            </button>
                          </div>
                        );
                      })}
</div>
                    {!currentMembers.some((m) =>
                      filter === "Pending fees"
                        ? balance(d, m.id) > 0
                        : filter === "Expired"
                          ? (latest(d, m.id)?.end || "9999") < t
                          : soon.some((x) => x.id === m.id),
                    ) && (
                      <Empty text="You're all caught up. No members in this list." />
                    )}
                  </section>
                  <p className="helper">
                    WhatsApp opens a prepared message. Send it there, then use
                    “Log contact” here. Delivery is not tracked.
                  </p>
                </>
              ) : (
                <Messaging
                  key={reminderMode + messagingSection}
                  initialSection={messagingSection}
                  data={d}
                  role={role}
                  busy={busy}
                  mutate={mutate}
                  sendMessage={sendMessage}
                  flash={flash}
                  logOnly={reminderMode === "Delivery log"}
                  onDirtyChange={setReminderDirty}
                  onSendingChange={setReminderSending}
                />
              )}
            </>
          ) : page === "Reports" ? (
            <Reports data={d} download={exportWithAudit} />
          ) : page === "Audit" ? (
            role === "owner" ? (
              <AuditLog data={d} />
            ) : (
              <section className="panel settings-card">
                <div className="panel-header">
                  <h2>Admin permission required</h2>
                </div>
                <p className="helper">
                  Only the gym admin can view the activity audit.
                </p>
              </section>
            )
          ) : (
            <>
              <div className="two-column">
                <section className="panel settings-card">
                  <div className="panel-header">
                    <h2>Gym details</h2>
                    {role === "owner" && (
                      <button
                        className="small-button"
                        onClick={() => setModal({ kind: "settings" })}
                      >
                        Edit details
                      </button>
                    )}
                  </div>
                  <dl>
                    <dt>Gym name</dt>
                    <dd>{d.gym.name}</dd>
                    <dt>Phone</dt>
                    <dd>{d.gym.phone || "Not added"}</dd>
                    <dt>Address</dt>
                    <dd>{d.gym.address || "Not added"}</dd>
                    <dt>Currency & timezone</dt>
                    <dd>INR · Asia/Kolkata</dd>
                  </dl>
                </section>
                <section className="panel settings-card">
                  <div className="panel-header">
                    <h2>Membership plans</h2>
                    {role === "owner" && (
                      <button
                        className="small-button"
                        onClick={() => setModal({ kind: "plan" })}
                      >
                        <Plus size={15} />
                        Add plan
                      </button>
                    )}
                  </div>
                  <div className="record-scroll" role="region" aria-label="Membership plans" tabIndex={0}>
{d.plans.map((p) => (
                    <div className="list-item" key={p.id}>
                      <span className="list-icon">
                        <Dumbbell size={18} />
                      </span>
                      <div>
                        <strong>{p.name}</strong>
                        <small>
                          {p.months} calendar{" "}
                          {p.months === 1 ? "month" : "months"}
                        </small>
                      </div>
                      <strong>{money(p.price)}</strong>
                      {role === "owner" && (
                        <>
                          <button
                            className="small-button"
                            aria-label={`Modify ${p.name} plan`}
                            onClick={() => setModal({ kind: "plan", plan: p })}
                          >
                            Modify plan
                          </button>
                          <button
                            className="small-button danger-text"
                            aria-label={`Delete ${p.name} plan`}
                            onClick={() => {
                              if (
                                confirm(
                                  `Delete the ${p.name} plan? Existing memberships keep their recorded plan and fee.`,
                                )
                              )
                                mutate(
                                  {
                                    type: "planDelete",
                                    payload: { id: p.id },
                                  },
                                  "Plan deleted; existing memberships are unchanged",
                                );
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  ))}
</div>
                </section>
              </div>
              {role === "owner" && (
                <StaffManager
                  data={d}
                  busy={busy}
                  mutate={mutate}
                  flash={flash}
                />
              )}
              <section className="panel settings-card">
                <div className="panel-header">
                  <h2>Workspace & integrations</h2>
                </div>
                <div className="integration-grid">
                  <div>
                    <CheckCircle2 />
                    <h3>Supabase connected</h3>
                    <p>
                      Your gym records are protected by staff access policies.
                    </p>
                  </div>
                  <div>
                    <MessageCircle />
                    <h3>WhatsApp reminders</h3>
                    <p>
                      {d.whatsapp?.config.enabled
                        ? "Automation is enabled. Review the reminder queue and delivery log."
                        : "Configure WhatsApp automation in Reminders."}
                    </p>
                    <button
                      className="small-button"
                      onClick={() => {
                        navigate("Reminders");
                        setReminderMode("Automated");
                      }}
                    >
                      Configure automation
                    </button>
                  </div>
                  <div>
                    <Activity />
                    <h3>Biometric attendance</h3>
                    <p>
                      Manual check-in is available. Device integration needs the
                      manufacturer, model and supported API.
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}
          <footer className="workspace-footer">
            <span>
              NGF Fitness <span>{GYM_NAME}</span>
            </span>
            <span>INR · India</span>
          </footer>
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {globalSearch && (
        <ModalView title="Global search" close={() => setGlobalSearch(false)}>
          <div className="global-search-content">
            <p className="modal-intro">
              Jump to a page, find a member by name or phone, or open a receipt.
            </p>
            <MemberFinder
              data={d}
              open={(m) => {
                setGlobalSearch(false);
                navigate("Members");
                setSelected(m);
              }}
              actions={nav.map(([p]) => ({
                label: p,
                keywords:
                  p === "Reminders"
                    ? ["messages", "whatsapp", "automation", "delivery"]
                    : [],
                run: () => {
                  setGlobalSearch(false);
                  navigate(p);
                },
              }))}
              receipt={(pid) => {
                setGlobalSearch(false);
                setModal({
                  kind: "receipt",
                  payment: d.payments.find((p) => p.id === pid),
                });
              }}
            />
          </div>
        </ModalView>
      )}
      {modal && (
        <ModalView
          key={
            modal.kind +
            (modal.member?.id ||
              modal.payment?.id ||
              modal.membership?.id ||
              "")
          }
          busy={busy}
          wide={modal.kind === "member" && !modal.member}
          className={["membership", "payment"].includes(modal.kind) ? "checkout-modal" : ""}
          title={
            {
              member: modal.member ? "Edit member" : "Add a member",
              membership: "New membership / renewal",
              payment: "Collect a payment",
              override: "Membership override",
              receipt: "Payment receipt",
              welcome: "Member registered",
              void: "Void payment",
              settings: "Gym details",
              plan: modal.plan ? "Modify plan" : "Add a plan",
              membershipEdit: "Edit membership",
              freeze: "Freeze membership",
              resume: "Resume membership",
              cancel: "Cancel membership",
              dueDate: "Set payment due date",
              expire: "End membership access",
              memberDelete: "Delete member",
              contact: "Log contact",
              attendanceRemove: "Correct check-in",
              password: "Choose a new password",
            }[modal.kind] || ""
          }
          close={() => {
            setModal(null);
            setError("");
          }}
        >
          <>
            {modal.member && !["receipt", "member", "membership", "payment"].includes(modal.kind) && <div className="modal-member-identity member-identity"><Avatar name={modal.member.name} photo={modal.member.photo}/><span><strong>{modal.member.name}</strong><small>{modal.member.phone}</small></span></div>}
            {modal.kind === "welcome" && modal.member ? (
              <><p>Member saved. Send a welcome message to {modal.member.name}.</p><WhatsAppLink phone={modal.member.phone} message={welcomeMessage(d,modal.member)}>Send welcome</WhatsAppLink><p className="muted">Opens WhatsApp with a prepared message. Review and send there.</p></>
            ) : modal.kind === "receipt" ? (
              <>
                <div className="print-receipt">
                  <div className="receipt-brand">
                    <img
                      className="receipt-logo"
                      src="/ngf-logo.jpg"
                      alt="Next Generation Fitness logo"
                    />
                    <h2>{modal.payment!.gymName || d.gym.name}</h2>
                    <p>{modal.payment!.gymAddress ?? d.gym.address}</p>
                    <p>{modal.payment!.gymPhone ?? d.gym.phone}</p>
                  </div>
                  <div className="receipt-title">
                    <h3>PAYMENT RECEIPT</h3>
                    <strong>{modal.payment!.receipt}</strong>
                  </div>
                  {modal.payment!.voided && (
                    <p className="error">
                      VOIDED — {modal.payment!.voidReason}
                    </p>
                  )}
                  <dl>
                    <dt>Member</dt>
                    <dd className="member-identity">
                      <Avatar name={modal.payment!.memberName || memberName(modal.payment!.memberId)} photo={d.members.find(m=>m.id===modal.payment!.memberId)?.photo}/>
                      {modal.payment!.memberName ||
                        memberName(modal.payment!.memberId)}
                    </dd>
                    <dt>Date</dt>
                    <dd>{date(modal.payment!.at)}</dd>
                    <dt>Membership</dt>
                    <dd>
                      {
                        d.memberships.find(
                          (m) => m.id === modal.payment!.membershipId,
                        )?.planName
                      }
                    </dd>
                    <dt>Payment method</dt>
                    <dd>{modal.payment!.method}</dd>
                    <dt>Reference</dt>
                    <dd>{modal.payment!.reference || "—"}</dd>
                  </dl>
                  <div className="receipt-total">
                    <span>Amount received</span>
                    <strong>{money(modal.payment!.amount)}</strong>
                  </div>
                  <p className="receipt-thanks">Thank you. Keep showing up.</p>
                </div>
                <div className="form-actions no-print">
                  {!modal.payment!.voided && d.members.find(m=>m.id===modal.payment!.memberId) && <>
                    <WhatsAppLink phone={d.members.find(m=>m.id===modal.payment!.memberId)!.phone} message={receiptMessage(d,modal.payment!)}>WhatsApp receipt</WhatsAppLink>
                    {modal.newRegistration && <WhatsAppLink phone={d.members.find(m=>m.id===modal.payment!.memberId)!.phone} message={welcomeMessage(d,d.members.find(m=>m.id===modal.payment!.memberId)!)}>Send welcome</WhatsAppLink>}
                  </>}
                  <button className="primary" onClick={() => window.print()}>
                    <Download size={16} />
                    Print / save PDF
                  </button>
                  {role === "owner" && !modal.payment!.voided && (
                    <button
                      className="danger-button"
                      onClick={() =>
                        setModal({ kind: "void", payment: modal.payment })
                      }
                    >
                      Void payment
                    </button>
                  )}
                </div>
              </>
            ) : (
              <ValidatedForm
                key={
                  modal.kind + (modal.member?.id || modal.membership?.id || "")
                }
                onSubmit={saveForm}
                busy={busy}
                serverError={error}
                onEdit={() => setError("")}
                validate={(form) =>
                  modal.kind === "member"
                    ? memberErrors(
                        d,
                        Object.fromEntries(new FormData(form).entries()),
                        modal.member?.id,
                      )
                    : {}
                }
              >
                {modal.kind === "membershipEdit" && modal.membership && (
                  <>
                    <p className="modal-intro">
                      Update this member’s membership. Payments and receipts are
                      kept; the pending balance updates with the fee.
                    </p>
                    <label>
                      Plan name
                      <input
                        readOnly={modal.membership.amount===0 || d.payments.some(p=>p.membershipId===modal.membership!.id && !p.voided && p.amount>0)}
                        name="planName"
                        required
                        maxLength={100}
                        defaultValue={modal.membership.planName}
                      />
                    </label>
                    <label>
                      Start date
                      <input
                        type="date"
                        name="start"
                        required
                        defaultValue={modal.membership.start}
                      />
                    </label>
                    <label>
                      Expiry date
                      <input
                        type="date"
                        name="end"
                        required
                        defaultValue={modal.membership.end}
                      />
                    </label>
                    <EditMembershipPricing membership={modal.membership} locked={modal.membership.amount===0 || d.payments.some(p=>p.membershipId===modal.membership!.id && !p.voided && p.amount>0)} />
                    <label>
                      Payment due date
                      <input
                        type="date"
                        name="dueDate"
                        defaultValue={modal.membership.dueDate || ""}
                      />
                    </label>
                    {modal.membership.freezeEnd &&
                      modal.membership.freezeEnd >= t && (
                        <p className="context-note">
                          Saving clears the existing pause. Review the expiry
                          date before saving.
                        </p>
                      )}
                    <label>
                      Reason for change
                      <textarea
                        name="reason"
                        required
                        minLength={5}
                        maxLength={500}
                      />
                    </label>
                  </>
                )}
                {modal.kind === "attendanceRemove" && modal.attendance && (
                  <>
                    <p className="modal-intro">
                      Remove the mistaken check-in for{" "}
                      {memberName(modal.attendance.memberId)} on{" "}
                      {date(modal.attendance.day)}. The original entry and your
                      reason stay in Audit. The member can then be checked in
                      again.
                    </p>
                    <label>
                      Correction reason
                      <textarea
                        name="reason"
                        required
                        minLength={5}
                        maxLength={500}
                      />
                    </label>
                  </>
                )}
                {["freeze", "resume", "cancel", "dueDate"].includes(
                  modal.kind,
                ) &&
                  modal.membership && (
                    <LifecycleForm
                      data={d}
                      membership={modal.membership}
                      kind={modal.kind}
                    />
                  )}
                {modal.kind === "memberDelete" && modal.member && (
                  <>
                    <p className="modal-intro">
                      Permanently delete <strong>{modal.member.name}</strong>?
                      This removes their memberships, attendance and reminder
                      history. Members with payment records cannot be deleted —
                      archive them instead.
                    </p>
                    <div className="error" role="alert">
                      This action cannot be undone.
                    </div>
                    <label className="checkbox">
                      <input type="checkbox" name="confirm" required />I
                      understand this member will be deleted permanently
                    </label>
                  </>
                )}
                {modal.kind === "expire" && modal.membership && (
                  <>
                    <p className="modal-intro">
                      End access for the {modal.membership.planName} membership
                      early. Payments and receipts are kept.
                    </p>
                    {modal.membership.freezeEnd &&
                      modal.membership.freezeEnd >= t && (
                        <p className="context-note">
                          Resume the scheduled or current freeze from the member
                          profile before changing expiry.
                        </p>
                      )}
                    <label>
                      End access on
                      <input
                        type="date"
                        name="endDate"
                        required
                        min={modal.membership.start}
                        max={modal.membership.end}
                        defaultValue={modal.membership.end}
                      />
                    </label>
                    <label>
                      Reason
                      <input
                        name="reason"
                        required
                        minLength={5}
                        maxLength={200}
                        placeholder="Why is access ending?"
                      />
                    </label>
                  </>
                )}
                {modal.kind === "contact" && (
                  <>
                    <p className="modal-intro">
                      Record contact with {modal.member?.name}. This records
                      staff activity; it does not send a message.
                    </p>
                    <label>
                      Contact type
                      <select name="kind" defaultValue={modal.contact?.kind}>
                        <option>Phone call</option>
                        <option>WhatsApp</option>
                        <option>In person</option>
                        <option>Other</option>
                      </select>
                    </label>
                    <label>
                      Contact notes
                      <textarea
                        name="note"
                        maxLength={500}
                        required
                        placeholder="Outcome and agreed next step"
                        defaultValue={modal.contact?.note}
                      />
                    </label>

                  </>
                )}
                {modal.kind === "member" && <MemberRegistration data={d} member={modal.member} busy={busy} />}
                {modal.kind === "membership" && (
                  <CheckoutForm data={d} member={modal.member} renew />
                )}
                {modal.kind === "payment" && (
                  <CheckoutForm data={d} member={modal.member} />
                )}
                {(modal.kind === "override" || modal.kind === "void") && (
                  <>
                    <p>
                      {modal.kind === "override"
                        ? `${modal.member!.name} does not have an active membership. An admin can record an exception.`
                        : "Voiding restores the balance and preserves this receipt in the audit trail."}
                    </p>
                    {role === "owner" ? (
                      <label>
                        Reason
                        <textarea
                          name="reason"
                          required
                          minLength={5}
                          maxLength={500}
                        />
                      </label>
                    ) : (
                      <p className="error">
                        Only the admin can perform this action.
                      </p>
                    )}
                  </>
                )}
                {modal.kind === "settings" && (
                  <>
                    <label>
                      Gym name
                      <input
                        name="name"
                        required
                        defaultValue={d.gym.name}
                        maxLength={100}
                      />
                    </label>
                    <label>
                      Phone
                      <input name="phone" defaultValue={d.gym.phone} />
                    </label>
                    <label>
                      Address
                      <textarea name="address" defaultValue={d.gym.address} />
                    </label>
                  </>
                )}
                {modal.kind === "plan" && (
                  <>
                    <label>
                      Plan name
                      <input
                        name="name"
                        required
                        maxLength={80}
                        defaultValue={modal.plan?.name}
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        Calendar months
                        <input
                          name="months"
                          type="number"
                          required
                          min="1"
                          max="36"
                          defaultValue={modal.plan?.months ?? 1}
                        />
                      </label>
                      <label>
                        Price (₹)
                        <input
                          name="price"
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          defaultValue={
                            modal.plan ? modal.plan.price / 100 : undefined
                          }
                        />
                      </label>
                    </div>
                    <p className="helper">
                      Plan prices are copied into memberships, preserving
                      historical fees.
                    </p>
                  </>
                )}
                {modal.kind === "password" && (
                  <label>
                    New password
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={12}
                      autoComplete="new-password"
                    />
                  </label>
                )}
                <div className="form-actions">
                  <button
                    type="button"
                    disabled={busy}
                    className="secondary"
                    onClick={() => {
                      setModal(null);
                      setError("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      (modal.kind === "expire" &&
                        !!modal.membership?.freezeEnd &&
                        modal.membership.freezeEnd >= t) ||
                      (["void", "override"].includes(modal.kind) &&
                        role !== "owner")
                    }
                  >
                    {busy && <Loader2 className="spin" size={16} />}{" "}
                    {busy
                      ? "Saving…"
                      : modal.kind === "payment"
                        ? "Receive full payment"
                        : modal.kind === "membership" ? "Complete membership & payment" : modal.kind === "member" && !modal.member ? "Complete registration" : modal.kind === "memberDelete"
                          ? "Delete member"
                          : modal.kind === "expire"
                            ? "End access"
                            : "Save"}
                  </button>
                </div>
              </ValidatedForm>
            )}
          </>
        </ModalView>
      )}
    </div>
  );
}
function Stat({
  title,
  value,
  icon,
  note,
  accent,
  onClick,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  note: ReactNode;
  accent: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="stat panel stat-link"
      onClick={onClick}
      aria-label={`View ${title.toLowerCase()}`}
    >
      <div>
        <span>{title}</span>
        <span className={"stat-icon " + accent}>{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </button>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Dumbbell size={26} />
      <p>{text}</p>
    </div>
  );
}
function SearchField({
  query,
  setQuery,
  placeholder = "Search members",
}: {
  query: string;
  setQuery: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search">
      <Search size={18} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  );
}
function Paginated<T>({
  records,
  render,
  label,
}: {
  records: T[];
  render: (records: T[]) => ReactNode;
  label: string;
}) {
  const [page, setPage] = useState(1);
  const size = 10,
    total = Math.max(1, Math.ceil(records.length / size));
  const signature = records.map((r: any) => r.id).join(",");
  useEffect(() => {
    setPage(1);
  }, [signature]);
  const current = Math.min(page, total);
  return (
    <>
      {render(records.slice((current - 1) * size, current * size))}
      {records.length > size && (
        <div className="pagination" aria-label={label + " pagination"}>
          <span>
            {(current - 1) * size + 1}–
            {Math.min(current * size, records.length)} of {records.length}{" "}
            {label}
          </span>
          <div>
            <button
              className="small-button"
              aria-label={"Previous " + label + " page"}
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <span>
              Page {current} / {total}
            </span>
            <button
              className="small-button"
              aria-label={"Next " + label + " page"}
              disabled={current === total}
              onClick={() => setPage(current + 1)}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function VisitCheckout({
  visit,
  busy,
  checkout,
}: {
  visit: Attendance;
  busy: boolean;
  checkout: () => void;
}) {
  const time = (value: string) =>
    new Date(value).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
    });
  const minutes = visit.outAt
    ? Math.max(
        0,
        Math.round((Date.parse(visit.outAt) - Date.parse(visit.at)) / 60000),
      )
    : 0;
  return (
    <div className="visit-checkout">
      {visit.outAt ? (
        <span>
          <strong>Out {time(visit.outAt)}</strong>
          <small>
            {minutes >= 60
              ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
              : `${minutes} min`}{" "}
            visit
          </small>
        </span>
      ) : visit.day === today() ? (
        <>
          <Badge tone="green">Inside</Badge>
          <button className="small-button" disabled={busy} onClick={checkout}>
            Check out
          </button>
        </>
      ) : (
        <small>Check-out not recorded</small>
      )}
    </div>
  );
}
