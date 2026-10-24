import { useCallback, useLayoutEffect, useRef } from "react";
/** Stable callback identity with the latest committed handler, never a stale closure. */
export function useStableEvent<Args extends unknown[], Result>(
  handler: (...args: Args) => Result,
) {
  const current = useRef(handler);
  useLayoutEffect(() => {
    current.current = handler;
  });
  return useCallback((...args: Args) => current.current(...args), []);
}
