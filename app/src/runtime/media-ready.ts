import type { HandleRegistry } from '../story/registry';
import { createLinkedAbortController, MediaPreparationError } from '../media/media-preparation';
import { prepareTimelineVideoFrame } from '../media/timeline-video-driver';
import { browserPrefersHevcAlpha } from '../media/alpha-video-sources';
import type {
  Direction,
  MediaKey,
  PrepareToken,
  SpineSegmentNode,
  StoryManifest
} from '../story/types';

const HAVE_FUTURE_DATA = 3;

type RequiredMedia = {
  key: MediaKey;
  timeoutMs: number;
  timeline: boolean;
};

export type WaitForRequiredMediaReadyOptions = {
  segment: SpineSegmentNode;
  direction: Direction;
  prepareToken: PrepareToken;
  registry: HandleRegistry;
  getMediaElement(key: MediaKey): HTMLMediaElement | null;
  pollIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

function requiredMedia(segment: SpineSegmentNode, direction: Direction): readonly RequiredMedia[] {
  const byKey = new Map<MediaKey, RequiredMedia>();
  for (const contract of segment.mediaPlayback ?? []) {
    const directionContract = direction === 1 ? contract.forward : contract.reverse;
    if (!directionContract.required) {
      continue;
    }
    for (const key of directionContract.media ?? contract.media) {
      const existing = byKey.get(key);
      byKey.set(key, {
        key,
        timeline: directionContract.mode === 'timeline' || directionContract.mode === 'scrub',
        timeoutMs: existing
          ? Math.min(existing.timeoutMs, contract.preparingTimeoutMs)
          : contract.preparingTimeoutMs
      });
    }
  }
  return [...byKey.values()];
}

export function requiredMediaKeys(segment: SpineSegmentNode, direction: Direction): readonly MediaKey[] {
  return requiredMedia(segment, direction).map(({ key }) => key);
}

export function prepareTimeoutForManifest(manifest: StoryManifest): number {
  const mediaTimeouts = manifest.nodes.flatMap((node) =>
    node.kind === 'segment'
      ? (node.mediaPlayback ?? []).map((contract) => contract.preparingTimeoutMs)
      : []
  );
  return Math.max(manifest.defaults.buildTimeoutMs, ...mediaTimeouts) + 1000;
}

export function findMediaElementByKey(
  roots: Iterable<HTMLElement>,
  key: MediaKey
): HTMLMediaElement | null {
  for (const root of roots) {
    for (const element of root.querySelectorAll<HTMLMediaElement>('[data-media-key]')) {
      if (element.dataset.mediaKey === key) {
        return element;
      }
    }
  }
  return null;
}

async function waitForDecodedMedia(
  key: MediaKey,
  getMediaElement: (key: MediaKey) => HTMLMediaElement | null,
  timeoutMs: number,
  pollIntervalMs: number,
  timeline: boolean,
  signal?: AbortSignal
): Promise<void> {
  const linked = createLinkedAbortController(signal);
  const controller = linked.controller;
  const deadline = setTimeout(() => controller.abort(new MediaPreparationError(
    'MEDIA_PREPARATION_TIMEOUT', `Media ${key} admission timed out after ${timeoutMs}ms`
  )), timeoutMs);
  try {
    const media = await new Promise<HTMLMediaElement>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', abort); };
      const abort = () => { finish(); reject(controller.signal.reason); };
      const check = () => {
        if (controller.signal.aborted) { abort(); return; }
        const element = getMediaElement(key);
        if (element?.error) {
          finish(); reject(new MediaPreparationError('MEDIA_ELEMENT_ERROR',
            `${key}: ${element.error.message}`, { cause: element.error })); return;
        }
        if (element && (timeline || element.readyState >= HAVE_FUTURE_DATA)) {
          finish(); resolve(element); return;
        }
        if (element && element.preload !== 'auto') { element.preload = 'auto'; element.load(); }
        timer = setTimeout(check, pollIntervalMs);
      };
      controller.signal.addEventListener('abort', abort, { once: true });
      check();
    });
    if (timeline) {
      // Decoder admission needs a presented first frame, not continuous-play
      // buffering. Build/prepareLeg still proves the exact authored endpoint.
      const proof = await prepareTimelineVideoFrame(media as HTMLVideoElement, {
        runId: `admission:${key}`, direction: 1, progress: 0,
        durationFallbackSeconds: Number.isFinite(media.duration) ? media.duration : 1,
        allowSeekedFrameFallback: browserPrefersHevcAlpha(), signal: controller.signal
      });
      if (proof?.status !== 'ready') throw new MediaPreparationError(
        'MEDIA_PREPARATION_ABORTED', `Media ${key} admission superseded`
      );
    }
  } finally { clearTimeout(deadline); linked.dispose(); }
}

export async function waitForRequiredMediaReady(
  options: WaitForRequiredMediaReadyOptions
): Promise<void> {
  const required = requiredMedia(options.segment, options.direction);
  if (required.length === 0) {
    return;
  }

  const guard = { prepareToken: options.prepareToken };
  for (const { key } of required) {
    options.registry.beginMediaGate(key, guard);
  }

  const linked = createLinkedAbortController(options.signal);
  try { await Promise.all(required.map(async ({ key, timeoutMs, timeline }) => {
    await waitForDecodedMedia(
      key,
      options.getMediaElement,
      options.timeoutMs ?? timeoutMs,
      Math.max(1, options.pollIntervalMs ?? 8), timeline, linked.controller.signal
    );
    const result = options.registry.reportMediaReady(key, guard);
    if (!result.accepted) {
      throw new Error(`Media ${key} readiness rejected: ${result.reason}`);
    }
  })); } finally { linked.controller.abort(); linked.dispose(); }
}
