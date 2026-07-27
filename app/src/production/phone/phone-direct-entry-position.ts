export type PhoneDirectEntryOffsetRequest = Readonly<{
  rectTop: number;
  targetHeight: number;
  viewportHeight: number;
  proofPanelIndex?: 0 | 1 | 2 | undefined;
}>;

/**
 * Pure direct-entry geometry. The transaction controller owns the actual
 * measure → align → verify scroll command; this helper never schedules RAFs
 * or writes document scroll outside that transaction.
 */
export function resolvePhoneDirectEntryOffset({
  rectTop,
  targetHeight,
  viewportHeight,
  proofPanelIndex
}: PhoneDirectEntryOffsetRequest): number {
  const panelOffset = proofPanelIndex === undefined
    ? 0
    : proofPanelIndex * Math.max(0, targetHeight - viewportHeight) / 2;
  return Math.max(0, rectTop + panelOffset);
}
