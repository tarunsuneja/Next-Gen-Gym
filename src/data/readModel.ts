import type { Data } from "../domain";
/** A limited dashboard projection must never be used as a complete CRM ledger. */
export function requiresFullHistory(
  data: Data | null,
  context: { page: string; modal: boolean; member: boolean; search: boolean },
): boolean {
  return (
    !!data?.dashboard &&
    (context.page !== "Dashboard" ||
      context.modal ||
      context.member ||
      context.search)
  );
}
