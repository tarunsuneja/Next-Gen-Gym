import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  readHistory,
  type HistoryCursor,
  type HistoryPage,
  type HistoryQuery,
} from "../data/history";
import type { Payment, AuditEntry, Attendance } from "../domain";
import { friendlyError } from "../errors";
/** Only the current server page is retained. Cursor positions contain no record data. */
export function ServerHistory<T extends Payment | AuditEntry | Attendance>({
  query,
  revision,
  label,
  render,
}: {
  query: HistoryQuery;
  revision: unknown;
  label: string;
  render: (rows: T[]) => ReactNode;
}) {
  // Results keep a lightweight token rather than retaining an old history array.
  const revisionKey = useMemo(() => ({}), [revision]);
  const queryKey = JSON.stringify(query);
  const [navigation, setNavigation] = useState<{
    key: string;
    cursors: (HistoryCursor | null)[];
  }>({ key: queryKey, cursors: [null] });
  const cursors = navigation.key === queryKey ? navigation.cursors : [null];
  const cursor = cursors.at(-1) ?? null;
  const cursorKey = JSON.stringify(cursor);
  const [result, setResult] = useState<{
    queryKey: string;
    cursorKey: string;
    revision: unknown;
    page?: HistoryPage<T>;
    error?: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const previousSearch = useRef(query.search ?? "");
  useEffect(() => {
    const controller = new AbortController();
    const delay = previousSearch.current !== (query.search ?? "") ? 200 : 0;
    previousSearch.current = query.search ?? "";
    const timer = setTimeout(() => {
      void readHistory<T>(
        JSON.parse(queryKey),
        JSON.parse(cursorKey),
        controller.signal,
      )
        .then((page) => {
          if (!controller.signal.aborted)
            setResult({ queryKey, cursorKey, revision: revisionKey, page });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setResult({
              queryKey,
              cursorKey,
              revision: revisionKey,
              error: friendlyError(error),
            });
        });
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [queryKey, cursorKey, revisionKey, retry]);
  const current =
    result?.queryKey === queryKey &&
    result.cursorKey === cursorKey &&
    result.revision === revisionKey
      ? result
      : null;
  const page = current?.page;
  return (
    <div aria-busy={!current}>
      {!current && (
        <p className="helper" role="status">
          Loading {label}…
        </p>
      )}
      {current?.error && (
        <div className="helper" role="alert">
          <p>{current.error}</p>
          <button
            className="small-button"
            onClick={() => {
              setResult(null);
              setRetry((n) => n + 1);
            }}
          >
            Retry {label}
          </button>
        </div>
      )}
      {page && render(page.rows)}
      {page && (
        <div className="pagination" aria-label={`${label} pagination`}>
          <span>
            Page {cursors.length} · {page.rows.length} {label}
          </span>
          <div>
            <button
              className="small-button"
              aria-label={`Previous ${label} page`}
              disabled={cursors.length === 1}
              onClick={() =>
                setNavigation({ key: queryKey, cursors: cursors.slice(0, -1) })
              }
            >
              Previous
            </button>
            <button
              className="small-button"
              aria-label={`Next ${label} page`}
              disabled={!page.hasMore}
              onClick={() => {
                if (page.nextCursor)
                  setNavigation({
                    key: queryKey,
                    cursors: [...cursors, page.nextCursor],
                  });
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
