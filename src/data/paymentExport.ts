import { supabase } from "./client";
import { exportPages } from "./exportContract";
import { csvPagedBlob } from "../shared/csv";
import type { HistoryQuery } from "./history";
export function paymentExport(
  query: HistoryQuery,
  signal: AbortSignal,
): Promise<Blob> {
  const pages = exportPages(async (after, revision) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase
      .rpc("get_payment_export_page", {
        p_limit: 250,
        p_after_at: after?.at,
        p_after_id: after?.id,
        p_revision: revision,
        p_query: query.search ?? "",
        p_from: query.from,
        p_to: query.to,
        p_exclude_voided: query.excludeVoided ?? false,
      })
      .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(30000)]));
    if (error) throw error;
    return data;
  }, signal);
  return csvPagedBlob(
    ["Receipt", "Member", "Date", "Method", "Amount INR", "Status"],
    pages,
    signal,
  );
}
