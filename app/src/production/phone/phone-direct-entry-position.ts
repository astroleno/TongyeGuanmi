export type PhoneDirectEntryOffsetRequest = Readonly<{
  rectTop: number;
  targetHeight: number;
  viewportHeight: number;
  proofPanelIndex?: 0 | 1 | 2 | undefined;
}>;

/**
 * Positional readiness bridge for a lazy direct-entry corridor. A stable
 * target may only be measured after its own document branch and every
 * upstream branch that contributes vertical geometry have both mounted.
 */
export type PhoneDirectEntryGeometryReadiness = readonly [
  localDocumentReady: boolean,
  upstreamDocumentReady: boolean
];

export function phoneDirectEntryGeometryReady([
  localDocumentReady,
  upstreamDocumentReady
]: PhoneDirectEntryGeometryReadiness): boolean {
  return localDocumentReady && upstreamDocumentReady;
}

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
