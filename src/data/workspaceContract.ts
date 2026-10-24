import type { Data } from "../domain";
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
function fail(path: string): never {
  throw new Error(
    `Invalid workspace response at ${path}. Refresh or contact support.`,
  );
}
const string = (v: unknown, path: string) => {
  if (typeof v !== "string") fail(path);
};
const number = (v: unknown, path: string) => {
  if (typeof v !== "number" || !Number.isSafeInteger(v)) fail(path);
};
/** Validate wire data before it enters application state. Extra fields remain forward compatible. */
export function parseWorkspace(
  value: unknown,
  sections?: readonly string[],
): Data {
  if (!object(value)) fail("workspace");
  const includes = (key: string) => !sections || sections.includes(key);
  if (includes("gym")) {
    if (!object(value.gym)) fail("gym");
    for (const key of ["name", "phone", "address"])
      string(value.gym[key], `gym.${key}`);
  }
  const fields: Record<string, string[]> = {
    members: ["id", "name", "phone", "joined"],
    plans: ["id", "name"],
    memberships: ["id", "memberId", "planName", "start", "end"],
    payments: ["id", "membershipId", "memberId", "receipt", "at"],
    attendance: ["id", "memberId", "day", "at"],
    reminders: ["id", "memberId", "at"],
  };
  for (const [section, keys] of Object.entries(fields)) {
    if (!includes(section)) continue;
    const rows = value[section];
    if (!Array.isArray(rows)) fail(section);
    for (const [i, row] of rows.entries()) {
      if (!object(row)) fail(`${section}[${i}]`);
      for (const key of keys) string(row[key], `${section}[${i}].${key}`);
      if (section === "plans") number(row.price, `${section}[${i}].price`);
      if (section === "memberships" || section === "payments")
        number(row.amount, `${section}[${i}].amount`);
    }
  }
  for (const section of ["staff", "audit"])
    if (
      includes(section) &&
      value[section] !== undefined &&
      !Array.isArray(value[section])
    )
      fail(section);
  const wa = value.whatsapp;
  if (includes("whatsapp") && wa !== undefined) {
    if (!object(wa) || !object(wa.config)) fail("whatsapp");
    for (const key of ["templates", "rules", "messages"])
      if (!Array.isArray(wa[key])) fail(`whatsapp.${key}`);
  }
  if (value.dashboard !== undefined) {
    const summary = value.dashboard;
    if (
      !object(summary) ||
      typeof summary.day !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(summary.day) ||
      !object(summary.paid)
    )
      fail("dashboard");
    const parsedDay = Date.parse(summary.day);
    if (
      !Number.isFinite(parsedDay) ||
      new Date(parsedDay).toISOString().slice(0, 10) !== summary.day
    )
      fail("dashboard.day");
    const earliest = new Date(parsedDay - 62 * 86400000)
      .toISOString()
      .slice(0, 10);
    const membershipIds = new Set(
      (value.memberships as { id: string }[]).map((m) => m.id),
    );
    const nonnegative = (v: unknown, path: string) => {
      number(v, path);
      if ((v as number) < 0) fail(path);
    };
    for (const [id, amount] of Object.entries(summary.paid)) {
      if (!membershipIds.has(id)) fail("dashboard.paid");
      nonnegative(amount, `dashboard.paid.${id}`);
    }
    for (const key of ["paymentDays", "visitDays", "hours"]) {
      const rows = summary[key];
      if (!Array.isArray(rows) || rows.length > (key === "hours" ? 24 : 63))
        fail(`dashboard.${key}`);
      const seen = new Set();
      for (const row of rows) {
        if (!object(row)) fail(`dashboard.${key}`);
        const id = key === "hours" ? row.hour : row.day;
        if (seen.has(id)) fail(`dashboard.${key}`);
        seen.add(id);
        if (key === "hours") {
          nonnegative(id, "dashboard.hour");
          if ((id as number) > 23) fail("dashboard.hour");
        } else if (
          typeof id !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(id) ||
          id < earliest ||
          id > summary.day
        )
          fail("dashboard.day");
        if (key !== "visitDays") nonnegative(row.amount, "dashboard.amount");
        if (key !== "hours") nonnegative(row.count, "dashboard.count");
      }
    }
    if (!Array.isArray(value.payments) || value.payments.length > 5)
      fail("dashboard.payments");
  }
  return value as unknown as Data;
}

/** Merge only requested sections into an already validated workspace. */
export function mergeWorkspaceSections(
  previous: Data,
  patch: unknown,
  sections: readonly string[],
): Data {
  if (!object(patch)) fail("update");
  const selected: Record<string, unknown> = {};
  for (const section of sections) {
    if (!Object.prototype.hasOwnProperty.call(patch, section)) fail(section);
    selected[section] = patch[section];
  }
  const merged = { ...previous, ...selected };
  return parseWorkspace(merged, sections);
}
