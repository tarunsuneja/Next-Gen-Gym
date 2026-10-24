import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
export function Paginated<T extends { id: string }>({
  records,
  render,
  label,
  disabled = false,
}: {
  disabled?: boolean;
  records: T[];
  render: (records: T[]) => ReactNode;
  label: string;
}) {
  const [page, setPage] = useState(1);
  const size = 10,
    total = Math.max(1, Math.ceil(records.length / size));
  const signature = useMemo(
    () => records.map((r) => r.id).join(","),
    [records],
  );
  useEffect(() => {
    setPage(1);
  }, [signature]);
  const current = Math.min(page, total);
  if (disabled) return <>{render(records)}</>;
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
