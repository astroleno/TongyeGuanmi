/** Optional warming only. Visible scenes keep their normal readiness path. */
export function permitsSpeculativeMedia(): boolean {
  const connection = typeof navigator === 'undefined' ? undefined
    : (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string; downlink?: number } }).connection;
  return !connection?.saveData
    && !/^(slow-2g|2g|3g)$/.test(connection?.effectiveType ?? '')
    && !(typeof connection?.downlink === 'number' && connection.downlink < 1.5);
}
