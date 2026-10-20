/* global window, document, requestAnimationFrame */

// Shared by the original browser runner and the Ego adapter. Keep the approved
// 10-second native-scroll sweep, preparation and media evidence unchanged.
export async function measureScrollBaseline() {
  const intervals = [];
  let start;
  let previous;
  await new Promise((resolve) => {
    const tick = (now) => {
      start ??= now; previous ??= now;
      intervals.push(now - previous); previous = now;
      if (now - start < 10000) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
  return { url: window.location.href, visible: !document.hidden, intervals,
    longTasksSupported: typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask') };
}

export async function measureScrollSegment(id) {
  const api = window.__r5ScrollStory;
  const range = api.index().ranges.find((range) => range.id === id);
  const samples = [], longTasks = [];
  const longTasksSupported = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask');
  const observer = longTasksSupported
    ? new PerformanceObserver((list) => longTasks.push(...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })))) : null;
  observer?.observe({ type: 'longtask', buffered: false });
  const duration = 10000;
  let start;
  let previous;
  await new Promise((resolve) => {
    const tick = (now) => {
      // RAF's frame timestamp can predate performance.now() in the task
      // scheduling this callback. Use one clock for the entire sweep.
      start ??= now; previous ??= now;
      const progress = .2 + .6 * Math.min(1, (now - start) / duration);
      window.scrollTo(0, Math.round(range.start + (range.end - range.start) * progress));
      const state = api.snapshot();
      samples.push({ viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio, focused: document.hasFocus() }, time: now - start, interval: now - previous,
        rangeId: state.desired.rangeId, epoch: state.intent.epoch, presentedEpoch: state.presented?.epoch ?? null,
        visible: !document.hidden,
        documentScroll: window.scrollY, desiredScroll: state.desired.scroll,
        documentPose: (window.scrollY - range.start) / (range.end - range.start),
        desired: state.desired.progress, presented: state.presented?.progress ?? null,
        status: state.view.status,
        videos: [...document.querySelectorAll('.story-scroll video')].map((video) => ({
          time: video.currentTime, target: Number(video.dataset.timelineVideoTarget),
          seeking: video.seeking, readyState: video.readyState,
          presentedTime: Number(video.dataset.timelineVideoPresentedTime),
          sourceTime: video.dataset.timelineVideoSourceTime === undefined ? null : Number(video.dataset.timelineVideoSourceTime),
          evidence: video.dataset.timelineVideoFrameEvidence, paused: video.paused
        })),
        canvases: [...document.querySelectorAll('.story-scroll canvas[data-packed-alpha-media-time], .story-scroll canvas[data-scroll-video-media-time]')].map((canvas) => ({
          time: Number(canvas.dataset.packedAlphaMediaTime ?? canvas.dataset.scrollVideoMediaTime),
          kind: canvas.dataset.scrollVideoMediaTime === undefined ? 'packed-alpha' : 'native-decoded',
          generation: canvas.dataset.packedAlphaGeneration === undefined ? null : Number(canvas.dataset.packedAlphaGeneration),
          frame: canvas.dataset.packedAlphaFrame ?? null, ready: canvas.dataset.packedAlphaFrameReady ?? 'true'
        })) });
      previous = now;
      if (now - start < duration) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
  const stopped = performance.now();
  await new Promise((resolve) => {
    const check = () => {
      const state = api.snapshot();
      if (Math.abs((state.presented?.progress ?? -1) - .8) < .002 || performance.now() - stopped >= 2000) resolve();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
  const convergenceMs = performance.now() - stopped;
  if (observer) longTasks.push(...observer.takeRecords().map(({ startTime, duration }) => ({ startTime, duration })));
  observer?.disconnect();
  return { id, convergenceMs, final: api.snapshot(), samples, longTasks, longTasksSupported,
    resources: { videos: document.querySelectorAll('.story-scroll video').length, canvases: document.querySelectorAll('.story-scroll canvas').length } };
}
