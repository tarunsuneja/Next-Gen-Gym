import { useEffect, useRef, useState } from "react";
import { supabase } from "../../data/client";
import { parseWorkspace } from "../../data/workspaceContract";
import { friendlyError } from "../../errors";
import { id, type Data } from "../../domain";
import type { Json } from "../../data/database.generated";

type Section = "members" | "memberships" | "payments" | "attendance" | "plans";
type Review = {
  action: string;
  payload: Json;
  reason: string;
  revision: string;
  requestId: string;
};
const actions: Record<Section, [string, string][]> = {
  members: [
    ["member", "Update member"],
    ["memberDelete", "Delete member without receipts"],
  ],
  memberships: [
    ["membershipEdit", "Update membership details"],
    ["cancel", "Cancel membership"],
    ["membershipExpire", "End access"],
    ["dueDate", "Correct due date"],
  ],
  payments: [
    ["void", "Void incorrect receipt"],
    ["paymentDelete", "Delete payment permanently"],
  ],
  attendance: [["attendanceRemove", "Remove incorrect check-in"]],
  plans: [
    ["plan", "Update plan"],
    ["planDelete", "Delete plan"],
  ],
};
function correctionPayload(
  data: Data,
  section: Section,
  recordId: string,
  action: string,
) {
  const row = data[section].find((r) => r.id === recordId);
  if (!row) return {};
  if (action === "member") {
    const m = data.members.find((r) => r.id === recordId)!;
    const { photo: _photo, ...fields } = m;
    return fields;
  }
  if (action === "plan") return data.plans.find((r) => r.id === recordId)!;
  const period = data.memberships.find((r) => r.id === recordId);
  if (action === "membershipEdit" && period)
    return {
      id: period.id,
      planName: period.planName,
      start: period.start,
      end: period.end,
      amount: period.amount,
      baseAmount: period.baseAmount ?? period.amount,
      discountType: period.discountType ?? "fixed",
      discountValue: period.discountValue ?? 0,
      dueDate: period.dueDate,
    };
  if (action === "membershipExpire")
    return { id: recordId, endDate: period?.end };
  if (action === "dueDate") return { id: recordId, dueDate: period?.dueDate };
  return { id: recordId };
}

export default function DeveloperTools({
  onSaved,
  onPassword,
}: {
  onSaved: () => Promise<unknown>;
  onPassword: () => void;
}) {
  const [snapshot, setSnapshot] = useState<{ data: Data; revision: string }>();
  const [section, setSection] = useState<Section>("members");
  const [recordId, setRecordId] = useState("");
  const [action, setAction] = useState("member");
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState("");
  const [reason, setReason] = useState("");
  const [receiptConfirmation, setReceiptConfirmation] = useState("");
  const [review, setReview] = useState<Review>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const alive = useRef(true);
  async function reload(signal?: AbortSignal) {
    const query = supabase!.rpc("developer_workspace");
    const result = await query.abortSignal(
      signal ?? AbortSignal.timeout(30000),
    );
    if (result.error) throw result.error;
    const value = result.data as { data?: unknown; revision?: unknown };
    if (!value || typeof value.revision !== "string")
      throw Error("Invalid developer snapshot.");
    const next = { data: parseWorkspace(value.data), revision: value.revision };
    if (alive.current) {
      setSnapshot(next);
      setReview(undefined);
      setRecordId("");
      setPayload("");
    }
  }
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void reload(
      AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
    ).catch((e) => {
      if (alive.current) setError(friendlyError(e));
    });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, []);
  function choose(nextId: string, nextAction = action) {
    setNotice("");
    setReceiptConfirmation("");
    setRecordId(nextId);
    setAction(nextAction);
    setReview(undefined);
    setReason("");
    setError("");
    setPayload(
      snapshot
        ? JSON.stringify(
            correctionPayload(snapshot.data, section, nextId, nextAction),
            null,
            2,
          )
        : "",
    );
  }
  async function apply() {
    if (!review || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    let committed = false;
    try {
      const { error } = await supabase!.rpc("developer_correct", {
        p_action: review.action,
        p_payload: review.payload,
        p_reason: review.reason,
        p_revision: review.revision,
        p_request_id: review.requestId,
      });
      if (error) throw error;
      committed = true;
      if (!alive.current) return;
      setReview(undefined);
      setNotice("Correction saved and audited.");
      await onSaved();
      if (alive.current) await reload();
    } catch (e) {
      if (alive.current)
        setError(
          committed
            ? "Correction saved, but refresh failed. Reload before making another correction."
            : friendlyError(e),
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const rows = snapshot?.data[section] ?? [];
  const filtered = rows.filter((row) =>
    JSON.stringify(row).toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Developer data cleanup</h2>
          <p>
            Current gym only. Payment deletion requires receipt confirmation and
            preserves its audit history. Void remains available for corrections.
          </p>
        </div>
        <button type="button" className="secondary" onClick={onPassword}>
          Set account password
        </button>
      </div>
      <div style={{ padding: "0 20px 20px" }}>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        <fieldset
          disabled={busy || !snapshot}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <div className="form-grid">
            <label>
              Record type
              <select
                aria-label="Record type"
                value={section}
                onChange={(e) => {
                  const next = e.target.value as Section;
                  setSection(next);
                  setAction(actions[next][0][0]);
                  setRecordId("");
                  setPayload("");
                  setReview(undefined);
                  setQuery("");
                  setReason("");
                }}
              >
                {Object.keys(actions).map((key) => (
                  <option key={key}>{key}</option>
                ))}
              </select>
            </label>
            <label>
              Search records
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, receipt or record ID"
              />
            </label>
          </div>
          <label>
            Record
            <select
              aria-label="Record"
              value={recordId}
              onChange={(e) => choose(e.target.value)}
            >
              <option value="">
                Select a record ({filtered.length} matches)
              </option>
              {filtered.map((row) => (
                <option value={row.id} key={row.id}>
                  {"name" in row
                    ? row.name
                    : "receipt" in row
                      ? row.receipt
                      : "planName" in row
                        ? row.planName
                        : row.id}{" "}
                  · {row.id}
                </option>
              ))}
            </select>
          </label>
          {recordId && (
            <>
              <label>
                Correction
                <select
                  aria-label="Correction"
                  value={action}
                  onChange={(e) => choose(recordId, e.target.value)}
                >
                  {actions[section].map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="helper">
                Amounts are in paise: 120000 = ₹1,200. Existing validation,
                receipt protection and permission checks still apply.
              </p>
              <label>
                Proposed fields (JSON)
                <textarea
                  rows={12}
                  value={payload}
                  onChange={(e) => {
                    setPayload(e.target.value);
                    setReview(undefined);
                  }}
                />
              </label>
              <label>
                Reason for correction
                <textarea
                  required
                  minLength={10}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setReview(undefined);
                  }}
                />
              </label>
              {action === "paymentDelete" && (
                <>
                  <p className="error">
                    Permanently removes this receipt. Its amount becomes pending
                    again unless it was already voided. The original payment
                    remains in the developer audit history.
                  </p>
                  <label>
                    Type receipt number to delete
                    <input
                      value={receiptConfirmation}
                      autoComplete="off"
                      onChange={(e) => {
                        setReceiptConfirmation(e.target.value);
                        setReview(undefined);
                      }}
                    />
                  </label>
                </>
              )}
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  try {
                    const proposed: unknown = JSON.parse(payload);
                    if (
                      !proposed ||
                      typeof proposed !== "object" ||
                      Array.isArray(proposed) ||
                      !("id" in proposed) ||
                      proposed.id !== recordId
                    )
                      throw Error("Keep the selected record ID unchanged.");
                    if (reason.trim().length < 10)
                      throw Error(
                        "Explain the correction in at least 10 characters.",
                      );
                    const receipt = snapshot!.data.payments.find(
                      (p) => p.id === recordId,
                    )?.receipt;
                    if (
                      action === "paymentDelete" &&
                      (!receipt || receiptConfirmation !== receipt)
                    )
                      throw Error(
                        "Type the exact receipt number to confirm payment deletion.",
                      );
                    setError("");
                    setReview({
                      action,
                      payload:
                        action === "paymentDelete"
                          ? ({
                              ...proposed,
                              confirmReceipt: receiptConfirmation,
                            } as Json)
                          : (proposed as Json),
                      reason: reason.trim(),
                      revision: snapshot!.revision,
                      requestId: id(),
                    });
                  } catch (e) {
                    setError(friendlyError(e));
                  }
                }}
              >
                Review correction
              </button>
            </>
          )}
          <button
            className="text-button"
            type="button"
            onClick={() => {
              void reload().catch((e) => setError(friendlyError(e)));
            }}
          >
            Reload records
          </button>
          {review && (
            <section className="context-note" aria-label="Correction preview">
              <h3>Review before applying</h3>
              <details>
                <summary>Current record</summary>
                <pre
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {JSON.stringify(
                    rows.find((r) => r.id === recordId),
                    (key, value) =>
                      key === "photo" ? "[photo retained]" : value,
                    2,
                  )}
                </pre>
              </details>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {JSON.stringify(review.payload, null, 2)}
              </pre>
              <p>{review.reason}</p>
              <button
                type="button"
                className="danger-button"
                onClick={() => void apply()}
              >
                {review.action === "paymentDelete"
                  ? "Delete payment permanently"
                  : "Confirm correction"}
              </button>
            </section>
          )}
        </fieldset>
      </div>
    </section>
  );
}
