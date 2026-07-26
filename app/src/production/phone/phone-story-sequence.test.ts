import { describe, expect, it, vi } from 'vitest';
import {
  createPhoneStoryOrchestrator,
  type PhoneOrchestratedRunSession
} from './phone-story-orchestrator';
import { phoneStoryRuns } from './phone-story-runs';
import type {
  PhoneIntent,
  PhoneTransitionDirection
} from './phone-transition-coordinator';

function intent(
  inputEpoch: number,
  direction: PhoneTransitionDirection
): PhoneIntent {
  return {
    inputEpoch,
    direction,
    startY: direction === 1 ? 0 : 300,
    projectedY: direction === 1 ? 300 : 0
  };
}

describe('canonical phone story sequence', () => {
  it('runs the full forward and reverse story twice without stale ownership', () => {
    const root = { dataset: {} } as HTMLElement;
    const retryable = vi.fn();
    const lockTrace: boolean[] = [];
    const generations: number[] = [];
    const startedSessions: PhoneOrchestratedRunSession[] = [];
    let inputEpoch = 0;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'aod-animation',
      root,
      scrollY: () => 100,
      scrollTo: () => undefined,
      onLockChange: (locked) => lockTrace.push(locked),
      onRetryable: retryable
    });

    for (const run of phoneStoryRuns) {
      orchestrator.registerRunCapability(run.id, `sequence:${run.id}`, {
        position: () => 100,
        canStart: () => true,
        start: (_direction, session) => {
          startedSessions.push(session);
          generations.push(session.generation);
        }
      });
    }

    const drive = (direction: PhoneTransitionDirection) => {
      const runs = direction === 1
        ? phoneStoryRuns
        : [...phoneStoryRuns].reverse();
      for (const run of runs) {
        const source = direction === 1 ? run.from : run.to;
        const target = direction === 1 ? run.to : run.from;
        expect(orchestrator.cursor()).toMatchObject({
          kind: 'hold',
          scene: source
        });

        expect(orchestrator.handleIntent(intent(++inputEpoch, direction)))
          .toBe(true);
        const session = startedSessions.at(-1);
        expect(session).toBeDefined();
        if (!session) throw new Error('Expected an active phone run session');
        expect(orchestrator.cursor()).toMatchObject({
          kind: 'transition',
          run: run.id,
          runSource: source,
          runTarget: target,
          direction
        });
        expect(session.valid()).toBe(true);

        session.reportPresentedFrame();
        session.reportAnimationStarted();

        if (run.legs.length > 1) {
          session.reportEndpointCommit('receiver');
          expect(orchestrator.cursor()).toMatchObject({
            kind: 'transition',
            legIndex: direction === 1 ? 1 : 0
          });
          session.reportPresentedFrame();
          session.reportAnimationStarted();
        }
        session.reportEndpointCommit('receiver');
        expect(orchestrator.cursor()).toMatchObject({
          kind: 'hold',
          scene: target
        });
        expect(session.valid()).toBe(false);
        expect(root.dataset.phoneTransitionLock).toBeUndefined();
        expect(root.dataset.phoneAnchorY).toBeUndefined();
      }
    };

    for (let cycle = 0; cycle < 2; cycle += 1) {
      drive(1);
      drive(-1);
    }

    expect(orchestrator.cursor()).toEqual({
      kind: 'hold',
      scene: 'aod-animation',
      revision: phoneStoryRuns.length * 4
    });
    expect(generations).toEqual(
      Array.from({ length: phoneStoryRuns.length * 4 }, (_, index) => index + 1)
    );
    expect(lockTrace).toEqual(
      generations.flatMap(() => [true, false])
    );
    expect(retryable).not.toHaveBeenCalled();
  });

  for (const [scene, run, leg] of [
    ['figure3-animation', 'brand-services', 1],
    ['ttg-animation', 'services-lab', 1],
    ['ph-animation', 'lab-education', 1],
    ['crane-animation', 'education-contact', 1]
  ] as const) {
    it.fails(
      `[Task 2] captures immutable execution identity for direct ${scene} entry`,
      () => {
        let session: PhoneOrchestratedRunSession | undefined;
        const orchestrator = createPhoneStoryOrchestrator({
          initialScene: scene,
          scrollY: () => 100,
          scrollTo: () => undefined
        });

        orchestrator.registerRunCapability(run, `direct:${run}`, {
          position: () => 100,
          canStart: () => true,
          start: () => undefined,
          startAtLeg: (_leg, activeSession) => {
            session = activeSession;
          }
        });
        orchestrator.activateDirectEntry();

        expect(session).toMatchObject({
          authorityId: expect.any(String),
          sessionId: expect.any(String),
          generation: expect.any(Number),
          leg,
          direction: 1
        });
      }
    );
  }
});
