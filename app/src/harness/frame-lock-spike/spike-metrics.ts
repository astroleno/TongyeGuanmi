import type { StrictVideoProbeCapability } from './strict-video-probe';

export type SpikeMetricSample = Readonly<{
  runId: string;
  direction: 1 | -1;
  sequence: number;
  desiredFrameIndex: number;
  presentedFrameIndex: number;
  status: 'presented' | 'stale';
  committed: boolean;
  seekToPresentMs: number;
  alphaMatteOk: boolean;
  timedOut: boolean;
  longFrameMs: number;
  capability: StrictVideoProbeCapability;
}>;

export type SpikeMetricSummary = Readonly<{
  sampleCount: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxFrameLag: number;
  wrongFrameCount: number;
  staleCommitCount: number;
  monotonicityErrorCount: number;
  longFrameCount: number;
  alphaFailureCount: number;
  timeoutCount: number;
  pass: boolean;
  rows: readonly SpikeMetricSample[];
}>;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function nearestRankPercentile(
  values: readonly number[],
  percentile: number
): number {
  assert(values.length > 0, 'percentile requires at least one value');
  assert(percentile > 0 && percentile <= 1, 'percentile must be in (0, 1]');
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(1, Math.ceil(percentile * sorted.length));
  const value = sorted[rank - 1];
  assert(value !== undefined, 'percentile rank must be present');
  return value;
}

export function summarizeSpikeMetrics(
  rows: readonly SpikeMetricSample[],
  { longFrameThresholdMs = 50 } = {}
): SpikeMetricSummary {
  assert(rows.length > 0, 'metric summary requires at least one sample');
  for (const row of rows) {
    assert(Number.isFinite(row.seekToPresentMs), 'seek latency must be finite');
  }
  const latencies = rows.map((row) => row.seekToPresentMs);
  const lastPresentedByDirection = new Map<string, number>();
  let monotonicityErrorCount = 0;
  for (const row of rows) {
    if (row.status !== 'presented' || !row.committed) continue;
    const key = `${row.runId}:${row.direction}`;
    const previous = lastPresentedByDirection.get(key);
    if (
      previous !== undefined
      && (row.direction === 1
        ? row.presentedFrameIndex < previous
        : row.presentedFrameIndex > previous)
    ) {
      monotonicityErrorCount += 1;
    }
    lastPresentedByDirection.set(key, row.presentedFrameIndex);
  }
  const maxFrameLag = Math.max(
    0,
    ...rows.map((row) => Math.abs(row.desiredFrameIndex - row.presentedFrameIndex))
  );
  const wrongFrameCount = rows.filter((row) => (
    row.status === 'presented'
      && row.desiredFrameIndex !== row.presentedFrameIndex
  )).length;
  const staleCommitCount = rows.filter((row) => (
    row.status === 'stale' && row.committed
  )).length;
  const longFrameCount = rows.filter((row) => row.longFrameMs > longFrameThresholdMs).length;
  const alphaFailureCount = rows.filter((row) => !row.alphaMatteOk).length;
  const timeoutCount = rows.filter((row) => row.timedOut).length;
  const p95Ms = nearestRankPercentile(latencies, 0.95);
  const p99Ms = nearestRankPercentile(latencies, 0.99);
  return {
    sampleCount: rows.length,
    p50Ms: nearestRankPercentile(latencies, 0.5),
    p95Ms,
    p99Ms,
    maxFrameLag,
    wrongFrameCount,
    staleCommitCount,
    monotonicityErrorCount,
    longFrameCount,
    alphaFailureCount,
    timeoutCount,
    pass: wrongFrameCount === 0
      && staleCommitCount === 0
      && monotonicityErrorCount === 0
      && longFrameCount === 0
      && alphaFailureCount === 0
      && timeoutCount === 0
      && p95Ms <= 100
      && p99Ms <= 180,
    rows: [...rows]
  };
}
