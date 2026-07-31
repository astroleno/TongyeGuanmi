import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SceneId } from '../../story/types';
import {
  createPhoneStoryRuntimeEngine as createPhoneStoryOrchestrator,
  type PhoneOrchestratedRunSession
} from './phone-story/runtime/engine';
import {
  phoneScenePresentationProofKind,
  phoneScenePresentationTuple,
  phoneSegmentPresentationTuple
} from './phone-story/manifest';
import { assertStablePhonePresentation } from './phone-stable-presentation';

const normalStableHolds = [
  'hero',
  'pattern',
  'star-map',
  'aod-animation',
  'method-top',
  'figure2-animation',
  'figure2-proof',
  'brand',
  'services',
  'lab',
  'education',
  'contact'
] as const satisfies readonly SceneId[];

const gradeASource = readFileSync(
  new URL('./PhoneGradeAStory.tsx', import.meta.url),
  'utf8'
);

function assertStablePhoneHold(root: HTMLElement, scene: SceneId): void {
  expect(root.dataset.phoneCursor).toBe(`hold:${scene}`);
  expect(root.dataset.phoneSession).toBeUndefined();
  expect(root.dataset.phoneTransitionLock).toBeUndefined();
  expect(root.dataset.phoneAnchorY).toBeUndefined();
  expect(root.dataset.phoneStableScene).toBe(scene);
  expect(root.dataset.phoneInputState).toBe('free');
  expect(root.dataset.phoneProjectionState).toBe('stable');
  expect(root.dataset.portraitStageActive).toBeUndefined();
}

function reportProof(
  session: PhoneOrchestratedRunSession,
  scene: SceneId,
  kind: Parameters<PhoneOrchestratedRunSession['presentationProofToken']>[0],
  subject: string
): void {
  const token = session.presentationProofToken(kind, subject);
  if (!token) throw new Error('Expected an active presentation token');
  session.reportPresentationProof({
    token,
    frameSequence: 1,
    observedAt: 1,
    connected: true,
    visible: true,
    coverageComplete: true,
    edge: phoneScenePresentationTuple(scene)[1]
  });
}

describe('phone stable presentation contract', () => {
  for (const scene of normalStableHolds) {
    it(
      `[Task 2] publishes one complete stable hold for ${scene}`,
      () => {
        const root = { dataset: {} } as HTMLElement;
        const orchestrator = createPhoneStoryOrchestrator({
          initialScene: scene,
          root,
          scrollY: () => 0,
          scrollTo: () => undefined
        });

        orchestrator.syncDiagnostics();

        assertStablePhoneHold(root, scene);
        assertStablePhonePresentation(orchestrator.getSnapshot());
      }
    );
  }

  it('[Task 2] never notifies an observable hold while its session lock or anchor remains', () => {
    const root = { dataset: {} } as HTMLElement;
    const services = { dataset: {} } as HTMLElement;
    const frames: Array<() => void> = [];
    let actualY = 0;
    const observed: Array<Readonly<{
      lock: string | undefined;
      anchor: string | undefined;
    }>> = [];
    let session: PhoneOrchestratedRunSession | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => actualY,
      scrollTo: (nextY) => { actualY = nextY; },
      scheduleFrame: (callback) => frames.push(callback)
    });

    orchestrator.registerRunCapability('brand-services', 'test', {
      position: () => 100,
      canStart: () => true,
      start: (_direction, activeSession) => {
        session = activeSession;
      }
    });
    orchestrator.registerScrollCorridor({
      id: 'stable-presentation',
      scenes: ['brand', 'services'],
      sample: () => null,
      boundary: () => 100,
      landing: () => 100
    });
    // A terminal candidate needs its manifest leaf, but this test retains
    // proof control to verify that stable publication happens only afterward.
    orchestrator.registerSurface({
      id: 'native:services',
      scene: 'services',
      kind: 'native',
      root: () => services,
      presentation: () => [true, true, true, true, 'static-poster'],
      adapter: { present() {} }
    });
    orchestrator.subscribe(() => {
      if (orchestrator.getSnapshot().status !== 'stable') return;
      observed.push({
        lock: root.dataset.phoneTransitionLock,
        anchor: root.dataset.phoneAnchorY
      });
    });

    expect(orchestrator.resolveIntent([1, 1, 0, 200])).toBe('claim-boundary');
    if (!session) throw new Error('Expected a claimed brand-services session');
    reportProof(
      session,
      phoneSegmentPresentationTuple('brand-figure3')[3],
      'effect-frame',
      'group45:effect'
    );
    session.reportEndpointCommit('receiver');
    reportProof(
      session,
      phoneSegmentPresentationTuple('figure3-services')[3],
      'packed-canvas-frame',
      'group45:figure3'
    );
    session.provideRelease({
      releaseGeometry: () => undefined,
      releaseResources: () => undefined
    });
    session.reportEndpointCommit('receiver');
    reportProof(
      session,
      'services',
      phoneScenePresentationProofKind('services'),
      phoneScenePresentationTuple('services')[4]
    );
    session.reportTargetPresented();
    frames.shift()?.();
    frames.shift()?.();
    session.reportPresentationCommitted();

    expect(observed).toEqual([{ lock: undefined, anchor: undefined }]);
  });

  it('[Task 5] makes Figure2 hold progress follow the shared document sample', () => {
    expect(gradeASource).not.toContain(
      'let runView: PhoneGradeARunView | null = null;'
    );
    expect(gradeASource).not.toContain(
      "window.addEventListener('scroll', schedule, { passive: true });"
    );
    expect(gradeASource).toContain('usePhoneStorySnapshot');
    expect(gradeASource).toContain(
      "scrollCorridor === 'method-grade-a'"
    );
    expect(gradeASource).not.toContain('stableGradeAHold');
  });
});
