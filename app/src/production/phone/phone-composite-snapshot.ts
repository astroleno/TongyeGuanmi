import { canonicalSceneIds } from '../../story/canonical-spine';
import type { SceneId } from '../../story/types';
import {
  phoneRunLegTuple,
  type PhoneRunId
} from './phone-story-runs';
import type {
  PhoneCinematicSnapshot,
  PhoneExecutionToken
} from './phone-story/runtime';
import { phoneSegmentPresentationTuple } from './phone-story/manifest';

function sceneIndex(scene: SceneId): number {
  return (canonicalSceneIds as readonly SceneId[]).indexOf(scene);
}

function rollbackEndpoint(
  [, , , , , , , direction]: PhoneCinematicSnapshot
): 0 | 1 {
  return direction === 1 ? 0 : 1;
}

/** Manifest-level description of a cinematic scene carried by a composite run. */
export type PhoneCompositeVisualScene =
  | 'figure3-animation'
  | 'ttg-animation';

export type PhoneCompositeVisualSpec = readonly [
  run: PhoneRunId,
  surface: string,
  stableTarget: SceneId
];

const compositeVisualSpecs = {
  'figure3-animation': ['brand-services', 'group45:figure3', 'services'],
  'ttg-animation': ['services-lab', 'group45:ttg', 'lab']
} as const satisfies Readonly<Record<
  PhoneCompositeVisualScene,
  PhoneCompositeVisualSpec
>>;

export function phoneCompositeVisualSpec(
  scene: PhoneCompositeVisualScene
): PhoneCompositeVisualSpec {
  return compositeVisualSpecs[scene];
}

/**
 * Each continuation owns one contiguous canonical interval. An active run
 * names its visual dependency directly; otherwise the stable scene in that
 * interval selects the lazy adapter closure.
 */
export function phoneCompositeAdapterScene<Scene extends SceneId>(
  snapshot: PhoneCinematicSnapshot,
  fallback: Scene,
  first: SceneId,
  last: SceneId,
  visual: Scene | null
): Scene {
  if (visual !== null) return visual;
  const index = sceneIndex(snapshot[0]);
  return index >= sceneIndex(first) && index <= sceneIndex(last)
    ? snapshot[0] as Scene
    : fallback;
}

/** The authority's active second leg is the sole source of media identity. */
export function phoneCompositeVisualExecution(
  snapshot: PhoneCinematicSnapshot,
  run: PhoneRunId
): PhoneExecutionToken | null {
  const [
    ,
    ,
    ,
    authorityId,
    sessionId,
    generation,
    activeRun,
    direction,
    legIndex,
    phase,
    ,
    ,
    ,
    ,
    ,
    ,
    ,
    ,
    presentationRevision
  ] = snapshot;
  if (
    activeRun !== run
    || legIndex !== 1
    || (phase !== 'preparing' && phase !== 'animating')
    || sessionId === null
    || generation === null
    || direction === null
    || presentationRevision === null
  ) return null;
  const leg = phoneRunLegTuple(run, legIndex);
  if (!leg) return null;
  const contract = phoneSegmentPresentationTuple(leg[0]);
  return [
    authorityId,
    sessionId,
    generation,
    legIndex,
    direction,
    {
      authorityId,
      sessionId,
      generation,
      leg: legIndex,
      revision: presentationRevision,
      subject: contract[9],
      kind: contract[8]
    }
  ];
}

/** Decoder warm-up follows the same dependency closure as the active run. */
export function phoneCompositeVisualPrewarm(
  snapshot: PhoneCinematicSnapshot,
  run: PhoneRunId,
  surface: string
): boolean {
  const [, sourceSurface, receiverSurface, , , , activeRun] = snapshot;
  return activeRun !== null
    ? activeRun === run
    : sourceSurface === surface || receiverSurface === surface;
}

/** Stable endpoints, active legs, and rollbacks all derive from one snapshot. */
export function phoneCompositeMediaProgress(
  snapshot: PhoneCinematicSnapshot,
  run: PhoneRunId,
  target: SceneId
): number {
  const [semanticScene, , , , , , activeRun, , legIndex, phase, progress] = snapshot;
  if (activeRun === run && legIndex !== null && phase !== null && progress !== null) {
    if (phase.startsWith('rollback-')) {
      return rollbackEndpoint(snapshot);
    }
    return legIndex === 1 ? progress : 0;
  }
  const completed = sceneIndex(semanticScene) >= sceneIndex(target);
  return completed ? 1 : 0;
}

export type PhoneCompositeVisualProjection = readonly [
  execution: PhoneExecutionToken | null,
  prewarm: boolean,
  mediaProgress: number
];

/** One render-ready tuple keeps consumers from recomputing the same snapshot. */
export function phoneCompositeVisualProjection(
  snapshot: PhoneCinematicSnapshot,
  run: PhoneRunId,
  surface: string,
  target: SceneId
): PhoneCompositeVisualProjection {
  return [
    phoneCompositeVisualExecution(snapshot, run),
    phoneCompositeVisualPrewarm(snapshot, run, surface),
    phoneCompositeMediaProgress(snapshot, run, target)
  ];
}

/** Keeps a measured document coordinate inside the browser's legal range. */
export function phoneClampDocumentLanding(
  documentTop: number,
  scrollHeight: number,
  viewportHeight: number
): number {
  const maxScrollY = Math.max(0, scrollHeight - Math.max(0, viewportHeight));
  return Math.min(maxScrollY, Math.max(0, documentTop));
}

export function phoneDocumentTop(element: HTMLElement | null): number | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const documentTop = window.scrollY + rect.top;
  const scrollHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0,
    window.scrollY + rect.bottom
  );
  return phoneClampDocumentLanding(
    documentTop,
    scrollHeight,
    window.innerHeight
  );
}

/**
 * Native-reading holds land on the content anchor declared by the manifest.
 * A document root remains the conservative fallback while a lazy branch is
 * mounting, but it cannot replace an authored proof target that lives deeper
 * in the same document subtree.
 */
export function phoneReadingLandingTarget(
  root: HTMLElement | null,
  selectors: readonly string[]
): HTMLElement | null {
  if (!root) return null;
  for (const selector of selectors) {
    const target = root.querySelector<HTMLElement>(selector);
    if (target) return target;
  }
  return root;
}

export function phoneSnapshotProjectsSurface(
  source: string | null,
  receiver: string,
  id: string
): boolean {
  return source === id || receiver === id;
}

export function phoneClampProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}
