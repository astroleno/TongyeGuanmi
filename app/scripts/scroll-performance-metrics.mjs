// Keep the approved continuous-scroll budgets unchanged. An unavailable
// measurement is not a zero and cannot qualify a release.
export const SCROLL_PERFORMANCE_SEGMENTS = Object.freeze([
  'hero-pattern', 'pattern-star-map', 'aod-method-top', 'figure2-distance-expand',
  'figure3-services', 'ttg-lab', 'ph-education', 'crane-contact'
]);

export function percentile95(values) {
  if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1];
}

export function summarizeScrollPerformance(result) {
  const { samples = [], longTasks = [], longTasksSupported, final, id } = result;
  const presented = samples.filter((sample) => sample.presented !== null);
  const finite = (value) => Number.isFinite(value);
  const validSamples = samples.length >= 3 && samples.every((sample, index) => (
    [sample.time, sample.interval, sample.desired, sample.documentPose].every(finite)
    && sample.interval >= 0 && (index === 0 || sample.time > samples[index - 1].time)
    && sample.rangeId === id && sample.visible === true
    && Array.isArray(sample.videos)
    && (sample.presented === null || finite(sample.presented) && sample.presentedEpoch === sample.epoch)
  )) && samples.at(-1).time >= 10000 && presented.length > 0;
  const metrics = {
    rafIntervalP95: percentile95(samples.slice(2).map((sample) => sample.interval)),
    poseLagP95: percentile95(presented.map((sample) => Math.max(0, sample.desired - sample.presented) * 10000 / .6)),
    documentPoseLagP95: percentile95(presented.map((sample) => Math.max(0, sample.documentPose - sample.presented) * 10000 / .6)),
    sourceFrameErrorSecondsP95: percentile95(samples.flatMap((sample) => (sample.videos ?? [])
      .filter((video) => video.sourceTime !== null).map((video) => Math.abs(video.presentedTime - video.sourceTime)))),
    requestedFrameLagSecondsP95: percentile95(samples.flatMap((sample) => (sample.videos ?? [])
      .filter((video) => video.sourceTime !== null).map((video) => Math.abs(video.target - video.sourceTime)))),
    allVideosPaused: samples.length > 0 && samples.every((sample) => Array.isArray(sample.videos)
      && sample.videos.every((video) => video.paused === true)),
    over50msTasks: longTasksSupported === true && longTasks.every(({ duration }) => finite(duration) && duration >= 0)
      ? longTasks.filter(({ duration }) => duration > 50).length : null
  };
  const checks = {
    completeVisibleSampling: validSamples,
    rafInterval: finite(metrics.rafIntervalP95) && metrics.rafIntervalP95 <= 20,
    poseLag: finite(metrics.poseLagP95) && metrics.poseLagP95 <= 100,
    convergence: finite(result.convergenceMs) && result.convergenceMs >= 0 && result.convergenceMs <= 150,
    longTasks: metrics.over50msTasks === null ? null : metrics.over50msTasks === 0,
    videosPaused: metrics.allVideosPaused,
    finalPose: Boolean(final && final.view.status === 'ready' && final.view.error === null && !final.pending
      && final.desired.rangeId === id && finite(final.desired.progress) && Math.abs(final.desired.progress - .8) < .002
      && finite(final.presented?.progress)
      && final.presented.epoch === final.intent.epoch && Math.abs(final.presented.progress - .8) < .002)
  };
  const failures = Object.entries(checks).filter(([, value]) => value === false).map(([name]) => name);
  const unavailable = Object.entries(checks).filter(([, value]) => value === null).map(([name]) => name);
  return { metrics, checks, failures, unavailable,
    measuredPassed: failures.length === 0,
    passed: failures.length === 0 && unavailable.length === 0 };
}
