export type CsvCell = string | number;
/** Keep escaping and spreadsheet-formula protection identical for every export. */
export function csvRow(row: readonly CsvCell[]): string {
  return row
    .map(
      (cell) =>
        '"' +
        String(cell)
          .replace(/^[=+@-]/, "'")
          .replaceAll('"', '""') +
        '"',
    )
    .join(",");
}

/** Bounded serialization batches avoid a second whole-file JavaScript string. */
export async function csvBlob(
  rows: readonly (readonly CsvCell[])[],
): Promise<Blob> {
  const parts: BlobPart[] = ["\uFEFF"];
  for (let offset = 0; offset < rows.length; offset += 500) {
    const end = Math.min(offset + 500, rows.length);
    const batch: string[] = [];
    for (let i = offset; i < end; i++)
      batch.push((i ? "\r\n" : "") + csvRow(rows[i]));
    parts.push(new Blob(batch));
    if (end < rows.length)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return new Blob(parts, { type: "text/csv;charset=utf-8" });
}

/** Only encoded Blob parts survive between server pages, not full record arrays. */
export async function csvPagedBlob(
  header: readonly CsvCell[],
  pages: AsyncIterable<readonly (readonly CsvCell[])[]>,
  signal: AbortSignal,
): Promise<Blob> {
  const parts: BlobPart[] = ["\uFEFF", csvRow(header)];
  for await (const rows of pages) {
    signal.throwIfAborted();
    parts.push(new Blob(rows.map((row) => "\r\n" + csvRow(row))));
  }
  signal.throwIfAborted();
  return new Blob(parts, { type: "text/csv;charset=utf-8" });
}
