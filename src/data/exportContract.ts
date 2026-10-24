import type { CsvCell } from "../shared/csv";
export type ExportCursor = { at: string; id: string };
type ExportPage = {
  revision: string;
  rows: { id: string; at: string; cells: CsvCell[] }[];
  hasMore: boolean;
  nextCursor: ExportCursor | null;
};
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function cursor(
  value: unknown,
): value is ExportCursor & Record<string, unknown> {
  return (
    object(value) &&
    typeof value.id === "string" &&
    uuid.test(value.id) &&
    typeof value.at === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value.at,
    ) &&
    Number.isFinite(Date.parse(value.at))
  );
}
function later(a: ExportCursor, b: ExportCursor): boolean {
  // PostgreSQL retains microseconds; Date.parse alone truncates to milliseconds.
  const timestamp = (at: string) =>
    BigInt(Date.parse(at)) * 1000n +
    BigInt((at.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(3, 6));
  const first = timestamp(a.at),
    second = timestamp(b.at);
  return (
    first > second ||
    (first === second && a.id.toLowerCase() > b.id.toLowerCase())
  );
}
export function parseExportPage(
  value: unknown,
  previous: ExportCursor | null,
  revision?: string,
): ExportPage {
  const invalid = () =>
    new Error("Invalid receipt export response. Please export again.");
  if (
    !object(value) ||
    typeof value.revision !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:\d+$/i.test(
      value.revision,
    ) ||
    !Array.isArray(value.rows) ||
    value.rows.length > 250 ||
    typeof value.hasMore !== "boolean"
  )
    throw invalid();
  if (revision !== undefined && revision !== value.revision)
    throw new Error("Gym records changed during export. Please export again.");
  let last = previous;
  for (const row of value.rows) {
    if (
      !cursor(row) ||
      !object(row) ||
      !Array.isArray(row.cells) ||
      row.cells.length !== 6 ||
      row.cells.some(
        (cell) =>
          typeof cell !== "string" &&
          (typeof cell !== "number" || !Number.isFinite(cell)),
      ) ||
      (last && !later(row, last))
    )
      throw invalid();
    last = row;
  }
  if (value.hasMore) {
    if (
      value.rows.length !== 250 ||
      !cursor(value.nextCursor) ||
      !last ||
      value.nextCursor.id !== last.id ||
      value.nextCursor.at !== last.at
    )
      throw invalid();
  } else if (value.nextCursor !== null) throw invalid();
  return value as unknown as ExportPage;
}
export async function* exportPages(
  fetchPage: (
    after: ExportCursor | null,
    revision?: string,
  ) => Promise<unknown>,
  signal: AbortSignal,
): AsyncGenerator<CsvCell[][]> {
  let after: ExportCursor | null = null;
  let revision: string | undefined;
  do {
    signal.throwIfAborted();
    const page = parseExportPage(
      await fetchPage(after, revision),
      after,
      revision,
    );
    signal.throwIfAborted();
    revision = page.revision;
    yield page.rows.map((row) => row.cells);
    if (!page.hasMore) return;
    after = page.nextCursor;
  } while (after);
}
