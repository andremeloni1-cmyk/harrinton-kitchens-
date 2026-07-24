import { useSyncExternalStore } from "react";

// Never re-subscribes; the value only ever flips once (server → client).
const emptySubscribe = () => () => {};

/**
 * True only after client hydration, false during SSR — without a
 * setState-in-effect. Use it to gate client-clock-dependent renders (e.g.
 * "today") so the UTC server render and the local client render agree on the
 * first paint instead of throwing a hydration mismatch.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true, // client
    () => false // server
  );
}
