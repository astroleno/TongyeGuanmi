import { describe, expect, it } from 'vitest';

import {
  nearestRankPercentile,
  summarizeSpikeMetrics,
  type SpikeMetricSample
} from './spike-metrics';

const capability = {
  rvfcAvailable: true,
  callbackFailure: false,
  evidenceType: 'video-frame-callback' as const,
  browserEngine: 'chromium',
  browserVersion: 'test',
  osVersion: 'macOS',
  deviceModel: 'desktop'
};

const sample = (overrides: Partial<SpikeMetricSample>): SpikeMetricSample => ({
  runId: 'run',
  direction: 1,
  sequence: 1,
  desiredFrameIndex: 0,
  presentedFrameIndex: 0,
  status: 'presented',
  committed: true,
  seekToPresentMs: 10,
  alphaMatteOk: true,
  timedOut: false,
  longFrameMs: 16,
  capability,
  ...overrides
});

describe('Spike metrics', () => {
  it('uses nearest-rank P50/P95/P99 percentiles', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(nearestRankPercentile(values, 0.5)).toBe(50);
    expect(nearestRankPercentile(values, 0.95)).toBe(100);
    expect(nearestRankPercentile(values, 0.99)).toBe(100);
    expect(summarizeSpikeMetrics(values.map((seekToPresentMs, index) => sample({
      sequence: index + 1,
      desiredFrameIndex: index,
      presentedFrameIndex: index,
      seekToPresentMs
    })))).toMatchObject({ p50Ms: 50, p95Ms: 100, p99Ms: 100 });
  });

  it('counts wrong frames, stale commits, monotonicity errors, long frames, alpha failures, and timeouts', () => {
    const metrics = summarizeSpikeMetrics([
      sample({ sequence: 1, desiredFrameIndex: 1, presentedFrameIndex: 0 }),
      sample({ sequence: 2, desiredFrameIndex: 2, presentedFrameIndex: 2, status: 'stale', committed: true }),
      sample({ sequence: 3, desiredFrameIndex: 3, presentedFrameIndex: 3, longFrameMs: 55 }),
      sample({ sequence: 4, desiredFrameIndex: 4, presentedFrameIndex: 4, alphaMatteOk: false }),
      sample({ sequence: 5, desiredFrameIndex: 3, presentedFrameIndex: 3 }),
      sample({ sequence: 6, desiredFrameIndex: 5, presentedFrameIndex: 5, timedOut: true })
    ]);

    expect(metrics).toMatchObject({
      wrongFrameCount: 1,
      staleCommitCount: 1,
      monotonicityErrorCount: 1,
      longFrameCount: 1,
      alphaFailureCount: 1,
      timeoutCount: 1,
      maxFrameLag: 1
    });
    expect(metrics.rows).toHaveLength(6);
    expect(metrics.rows.every((row) => row.capability === capability)).toBe(true);
  });
});
