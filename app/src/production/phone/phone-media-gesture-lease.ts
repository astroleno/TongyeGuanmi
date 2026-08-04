/**
 * A phone route may retry only its currently reducer-owned media execution
 * during a real gesture. It intentionally never scans, plays, or pauses
 * mounted videos: unrelated/retired media must not borrow this activation.
 */
export function attachPhoneMediaGestureLease(
  root: HTMLElement | null,
  retryActiveTransaction: () => boolean
): () => void {
  if (!root) return () => undefined;
  const pointerEvents = ['pointerdown', 'pointermove'] as const;
  // iOS maps a continuing finger to Pointer Events before its touchmove
  // reaches the coordinator. A blocked run can therefore retry through the
  // same runner during the active gesture without adding another touch owner
  // or touching a media element here.
  for (const event of pointerEvents) {
    root.addEventListener(event, retryActiveTransaction, { passive: true });
  }
  return () => pointerEvents.forEach((event) => {
    root.removeEventListener(event, retryActiveTransaction);
  });
}
