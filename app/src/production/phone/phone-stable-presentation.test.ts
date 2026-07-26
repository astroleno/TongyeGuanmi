import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SceneId } from '../../story/types';
import {
  createPhoneStoryOrchestrator,
  type PhoneOrchestratedRunSession
} from './phone-story-orchestrator';

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
}

describe('phone stable presentation contract', () => {
  for (const scene of normalStableHolds) {
    it.fails(
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
      }
    );
  }

  it.fails('[Task 2] never notifies an observable hold while its session lock or anchor remains', () => {
    const root = { dataset: {} } as HTMLElement;
    const frames: Array<() => void> = [];
    const observed: Array<Readonly<{
      lock: string | undefined;
      anchor: string | undefined;
    }>> = [];
    let session: PhoneOrchestratedRunSession | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => 0,
      scrollTo: () => undefined,
      scheduleFrame: (callback) => frames.push(callback)
    });

    orchestrator.registerRunCapability('brand-services', 'test', {
      position: () => 100,
      canStart: () => true,
      start: (_direction, activeSession) => {
        session = activeSession;
      }
    });
    orchestrator.subscribe((cursor) => {
      if (cursor.kind !== 'hold') return;
      observed.push({
        lock: root.dataset.phoneTransitionLock,
        anchor: root.dataset.phoneAnchorY
      });
    });

    expect(orchestrator.handleIntent({
      inputEpoch: 1,
      direction: 1,
      startY: 0,
      projectedY: 200
    })).toBe(true);
    if (!session) throw new Error('Expected a claimed brand-services session');
    session.reportPresentedFrame();
    session.reportAnimationStarted();
    session.reportEndpointCommit('receiver');
    session.reportPresentedFrame();
    session.reportAnimationStarted();
    session.provideRelease(() => undefined);
    session.reportEndpointCommit('receiver');
    frames.shift()?.();

    expect(observed).toEqual([]);
  });

  it.fails('[Task 5] makes Figure2 hold progress follow the shared document sample', () => {
    expect(gradeASource).not.toContain(
      'let runView: PhoneGradeARunView | null = null;'
    );
    expect(gradeASource).not.toContain(
      "window.addEventListener('scroll', schedule, { passive: true });"
    );
  });
});
