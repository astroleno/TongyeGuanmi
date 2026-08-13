import type { HandleRegistry } from '../story/registry';
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
};

export type WaitForRequiredMediaReadyOptions = {
  segment: SpineSegmentNode;
  direction: Direction;
  prepareToken: PrepareToken;
  registry: HandleRegistry;
  getMediaElement(key: MediaKey): HTMLMediaElement | null;
  pollIntervalMs?: number;
  timeoutMs?: number;
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
  const segmentTimeouts = manifest.nodes.flatMap((node) =>
    node.kind === 'segment'
      ? [
          node.buildTimeoutMs ?? manifest.defaults.buildTimeoutMs,
          ...(node.mediaPlayback ?? []).map((contract) => contract.preparingTimeoutMs)
        ]
      : []
  );
  return Math.max(manifest.defaults.buildTimeoutMs, ...segmentTimeouts) + 1000;
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

function waitForDecodedMedia(
  key: MediaKey,
  getMediaElement: (key: MediaKey) => HTMLMediaElement | null,
  timeoutMs: number,
  pollIntervalMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const check = () => {
      const media = getMediaElement(key);
      if (media && media.readyState >= HAVE_FUTURE_DATA) {
        resolve();
        return;
      }
      if (media && media.preload !== 'auto') {
        media.preload = 'auto';
        media.load?.();
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Media ${key} timed out before decoded future data was ready`));
        return;
      }
      setTimeout(check, pollIntervalMs);
    };

    check();
  });
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

  await Promise.all(required.map(async ({ key, timeoutMs }) => {
    await waitForDecodedMedia(
      key,
      options.getMediaElement,
      options.timeoutMs ?? timeoutMs,
      Math.max(1, options.pollIntervalMs ?? 8)
    );
    const result = options.registry.reportMediaReady(key, guard);
    if (!result.accepted) {
      throw new Error(`Media ${key} readiness rejected: ${result.reason}`);
    }
  }));
}
