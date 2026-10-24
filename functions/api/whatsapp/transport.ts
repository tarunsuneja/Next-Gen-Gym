/** Transport deadlines do not imply that an external write was rejected. */
export function fetchWithDeadline(
  input: RequestInfo | URL,
  init: RequestInit = {},
  milliseconds = 15000,
) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(milliseconds) });
}
export class ProviderRejectedError extends Error {}
