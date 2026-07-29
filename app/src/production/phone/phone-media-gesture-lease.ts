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
  const retry = () => {
    retryActiveTransaction();
  };
  root.addEventListener('pointerdown', retry, { passive: true });
  return () => {
    root.removeEventListener('pointerdown', retry);
  };
}
