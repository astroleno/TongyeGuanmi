import { describe, expect, it } from 'vitest';
import {
  createPhoneStoryOrchestrator,
  type PhoneOrchestratedRunSession
} from './phone-story-orchestrator';
import { phoneStoryRuns } from './phone-story-runs';
import type { PhoneTransitionDirection } from './phone-transition-coordinator';

function intent(inputEpoch: number, direction: PhoneTransitionDirection) {
  return {
    inputEpoch,
    direction,
    startY: direction === 1 ? 0 : 300,
    projectedY: direction === 1 ? 300 : 0
  };
}

describe('canonical phone story sequence', () => {
  it('runs the full forward and reverse story under one snapshot transaction contract', () => {
    const sessions: PhoneOrchestratedRunSession[] = [];
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'aod-animation',
      scrollY: () => 100,
      scrollTo: () => undefined
    });
    for (const run of phoneStoryRuns) {
      orchestrator.registerRunCapability(run.id, `sequence:${run.id}`, {
        position: () => 100,
        canStart: () => true,
        start: (_direction, session) => {
          sessions.push(session);
        }
      });
    }

    let epoch = 0;
    const drive = (direction: PhoneTransitionDirection) => {
      const runs = direction === 1 ? phoneStoryRuns : [...phoneStoryRuns].reverse();
      for (const run of runs) {
        const target = direction === 1 ? run.to : run.from;
        expect(orchestrator.handleIntent(intent(++epoch, direction))).toBe(true);
        const session = sessions.at(-1);
        if (!session) throw new Error('Expected a phone transaction session');
        session.reportPresentedFrame();
        for (let index = 0; index < run.legs.length; index += 1) {
          session.reportEndpointCommit('receiver');
          if (index < run.legs.length - 1) session.reportPresentedFrame();
        }
        session.reportTargetPresented();
        expect(orchestrator.getSnapshot()).toMatchObject({
          status: 'stable',
          scene: target,
          session: null
        });
      }
    };

    drive(1);
    drive(-1);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'aod-animation'
    });
  });

  it.each([
    ['figure3-animation', 'brand-services', 1],
    ['ttg-animation', 'services-lab', 1],
    ['ph-animation', 'lab-education', 1],
    ['crane-animation', 'education-contact', 1]
  ] as const)('captures immutable execution identity for direct %s entry', (
    scene,
    run,
    leg
  ) => {
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
  });
});
