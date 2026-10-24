/** A committed command must never be represented as a failed payment. */
export class CommittedRefreshError extends Error {
  readonly committed = true;
  constructor(
    readonly requestId: string,
    readonly cause: unknown,
  ) {
    super(
      "Saved successfully, but updated records could not be loaded. Refresh to see the saved result. Do not enter the payment again.",
    );
    this.name = "CommittedRefreshError";
  }
}
export async function commitAndRefresh<T>(
  requestId: string,
  commit: () => Promise<void>,
  refresh: () => Promise<T>,
): Promise<T> {
  await commit();
  try {
    return await refresh();
  } catch (error) {
    throw new CommittedRefreshError(requestId, error);
  }
}
