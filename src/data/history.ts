import { supabase } from "./client";
import type { Payment, AuditEntry, Attendance } from "../domain";
export type HistoryKind = "payments" | "audit" | "attendance";
export type HistoryCursor = { at: string; id: string };
export type HistoryQuery = {
  kind: HistoryKind;
  search?: string;
  from?: string;
  to?: string;
  excludeVoided?: boolean;
  inside?: boolean;
};
export type HistoryPage<T> = {
  rows: T[];
  hasMore: boolean;
  nextCursor: HistoryCursor | null;
};
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export async function readHistory<T extends Payment | AuditEntry | Attendance>(
  query: HistoryQuery,
  cursor: HistoryCursor | null,
  signal: AbortSignal,
): Promise<HistoryPage<T>> {
  if (!supabase) throw Error("Supabase is not configured.");
  const request =
    query.kind === "attendance"
      ? supabase.rpc("get_attendance_page", {
          p_limit: 10,
          p_before_at: cursor?.at,
          p_before_id: cursor?.id,
          p_query: query.search ?? "",
          p_from: query.from || undefined,
          p_to: query.to || undefined,
          p_inside: query.inside ?? false,
        })
      : supabase.rpc("get_history_page", {
          p_kind: query.kind,
          p_limit: 10,
          p_before_at: cursor?.at,
          p_before_id: cursor?.id,
          p_query: query.search ?? "",
          p_from: query.from || undefined,
          p_to: query.to || undefined,
          p_exclude_voided: query.excludeVoided ?? false,
        });
  const { data, error } = await request.abortSignal(
    AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  );
  if (error) throw error;
  const value: unknown = data;
  if (
    !record(value) ||
    !Array.isArray(value.rows) ||
    value.rows.length > 10 ||
    typeof value.hasMore !== "boolean"
  )
    throw Error("Invalid history page response.");
  for (const row of value.rows) {
    if (
      !record(row) ||
      typeof row.id !== "string" ||
      typeof row.at !== "string"
    )
      throw Error("Invalid history record.");
    if (
      query.kind === "payments" &&
      (typeof row.amount !== "number" ||
        !Number.isSafeInteger(row.amount) ||
        typeof row.receipt !== "string" ||
        typeof row.memberId !== "string")
    )
      throw Error("Invalid receipt record.");
    if (query.kind === "audit" && typeof row.action !== "string")
      throw Error("Invalid audit record.");
    if (
      query.kind === "attendance" &&
      (typeof row.memberId !== "string" ||
        typeof row.day !== "string" ||
        typeof row.override !== "string" ||
        (row.outAt !== null &&
          row.outAt !== undefined &&
          typeof row.outAt !== "string"))
    )
      throw Error("Invalid attendance record.");
  }
  const next = value.nextCursor;
  if (
    next !== null &&
    (!record(next) ||
      typeof next.at !== "string" ||
      typeof next.id !== "string")
  )
    throw Error("Invalid history cursor.");
  if (value.hasMore && (!next || value.rows.length !== 10))
    throw Error("Incomplete history cursor.");
  const last = value.rows.at(-1);
  if (
    value.hasMore &&
    record(next) &&
    record(last) &&
    (next.id !== last.id || next.at !== last.at)
  )
    throw Error("History cursor does not match its last record.");
  if (!value.hasMore && next !== null)
    throw Error("Unexpected history cursor.");
  return value as unknown as HistoryPage<T>;
}
export const supportsHistory = (data: unknown) =>
  record(data) &&
  record(data.capabilities) &&
  data.capabilities.historyPages === true;
