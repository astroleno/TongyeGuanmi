import type { ScrollPosition } from '../story/scroll-spine';
import type { ScrollIntent, ScrollPresentedFrame } from '../runtime/scroll-story-runtime';
import { timelineVideoDriverFor } from './timeline-video-driver';
import { collectScrollMediaRequests, compositeScrollMedia, sampleScrollMedia } from './scroll-media-sampling';

type Sample = { position: ScrollPosition; intent: ScrollIntent; targets: Array<{ time: number; generation: number }> };
const owners = new WeakMap<HTMLVideoElement, object>();
/** Bounded same-epoch pose history, including decoded in-flight samples rather than only the latest request. */
export function createScrollMediaCoherence(videos: readonly HTMLVideoElement[]) {
  const owner = {};
  for (const video of videos) { owners.set(video, owner); video.dataset.scrollMediaCoherent = 'true'; }
  let history: Sample[] = [];
  let shown: Sample | null = null;
  let pendingRequests = new Map<HTMLVideoElement, () => void>();
  const readTargets = () => videos.map((video) => {
    const state = timelineVideoDriverFor(video).snapshot();
    return { time: state.targetTime ?? NaN, generation: state.generation };
  });
  return {
    dispose() { for (const video of videos) if (owners.get(video) === owner) { owners.delete(video); delete video.dataset.scrollMediaCoherent; } },
    render(position: ScrollPosition, intent: ScrollIntent, paint: (position: ScrollPosition) => void): ScrollPresentedFrame | null {
      history = history.filter((sample) => sample.intent.epoch === intent.epoch);
      if (shown?.intent.epoch !== intent.epoch) shown = null;
      const requests = collectScrollMediaRequests(() => paint(position));
      const states = videos.map((video) => timelineVideoDriverFor(video).snapshot());
      const matches = ({ targets }: Sample) => targets.every((target, i) => {
        const state = states[i]!;
        return target.generation === state.presentedGeneration && state.presentedTime !== undefined
          && Math.abs(target.time - state.presentedTime) <= .002
          && (!videos[i]!.seeking || videos[i]!.dataset.timelineVideoFrameEvidence === 'video-frame-callback')
          && state.presentedPlayheadTime !== undefined
          && Math.abs(videos[i]!.currentTime - state.presentedPlayheadTime) <= .002;
      });
      const candidate = [...history].reverse().find(matches);
      let current = videos.length === 0 ? { position, intent, targets: [] } : candidate;
      if (current) {
        const position = current.position;
        const composed = sampleScrollMedia('present', () => { paint(position); return videos.every(compositeScrollMedia); });
        if (composed) shown = current; else current = undefined;
      }
      else sampleScrollMedia('hold', () => paint(shown?.position ?? position));
      const waitingPair = videos.length > 1 && history.length > 0 && !matches(history.at(-1)!);
      if (waitingPair) {
        // Retry the SAME pose after metadata/priming changes; never advance one
        // decoder alone while the other lane is still catching up.
        for (const request of pendingRequests.values()) request();
        // loadedmetadata can correct the duration after the first request.
        // Refresh that same pose's quantized targets, not its progress/intent.
        history.at(-1)!.targets = readTargets();
        return current ? { progress: current.position.progress, revision: current.intent.revision, epoch: current.intent.epoch } : null;
      }
      pendingRequests = requests;
      for (const request of requests.values()) request();
      const targets = readTargets();
      if (!history.length || history.at(-1)!.position.progress !== position.progress) {
        history.push({ position, intent, targets });
        if (history.length > 64) history.splice(0, history.length - 64);
      } else history[history.length - 1] = { position, intent, targets };
      return current ? { progress: current.position.progress, revision: current.intent.revision, epoch: current.intent.epoch } : null;
    }
  };
}
