import { describe, expect, it, vi } from 'vitest';
import {
  createPhoneStoryOrchestrator,
  type PhoneRunCapability
} from './phone-story-orchestrator';
import type { PhoneIntent } from './phone-transition-coordinator';

function intent(
  inputEpoch: number,
  direction: 1 | -1 = 1
): PhoneIntent {
  return {
    gestureId: inputEpoch,
    inputEpoch,
    direction,
    source: 'wheel',
    startY: direction === 1 ? 0 : 300,
    projectedY: direction === 1 ? 300 : 0,
    occurredAt: inputEpoch * 100
  };
}

function capability(
  position: number,
  start: PhoneRunCapability['start']
): PhoneRunCapability {
  return {
    position: () => position,
    canStart: () => true,
    start
  };
}

describe('single phone story orchestrator', () => {
  it('runs only the cursor-adjacent boundary and never scans ahead', () => {
    const starts: string[] = [];
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.registerRunCapability(
      'services-lab',
      'group45-services',
      capability(200, () => {
        starts.push('services-lab');
      })
    );

    expect(orchestrator.handleIntent(intent(1))).toBe(false);
    expect(starts).toEqual([]);
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'hold',
      scene: 'brand'
    });
  });

  it('consumes at most one adjacent run from a gesture epoch', () => {
    let brandSession: Parameters<PhoneRunCapability['start']>[1] | undefined;
    let servicesSession: Parameters<PhoneRunCapability['start']>[1] | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.registerRunCapability(
      'brand-services',
      'group45-brand',
      capability(100, (_direction, session) => {
        brandSession = session;
      })
    );
    orchestrator.registerRunCapability(
      'services-lab',
      'group45-services',
      capability(200, (_direction, session) => {
        servicesSession = session;
      })
    );

    expect(orchestrator.handleIntent(intent(1))).toBe(true);
    brandSession?.complete();
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'hold',
      scene: 'services'
    });
    expect(orchestrator.handleIntent(intent(1))).toBe(false);
    expect(servicesSession).toBeUndefined();
    expect(orchestrator.handleIntent(intent(2))).toBe(true);
    expect(servicesSession).toBeDefined();
  });

  it('keeps the latest Strict Mode registration when stale cleanup runs', () => {
    const firstStart = vi.fn();
    const secondStart = vi.fn();
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    const stale = orchestrator.registerRunCapability(
      'brand-services',
      'group45-brand',
      capability(100, firstStart)
    );
    orchestrator.registerRunCapability(
      'brand-services',
      'group45-brand',
      capability(100, secondStart)
    );

    stale.dispose();
    expect(orchestrator.handleIntent(intent(1))).toBe(true);
    expect(firstStart).not.toHaveBeenCalled();
    expect(secondStart).toHaveBeenCalledTimes(1);
  });

  it('rolls abort back before unlocking and ignores stale completion', () => {
    let session: Parameters<PhoneRunCapability['start']>[1] | undefined;
    const locks: boolean[] = [];
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo: () => undefined,
      onLockChange: (locked) => locks.push(locked)
    });
    orchestrator.registerRunCapability(
      'brand-services',
      'group45-brand',
      capability(100, (_direction, activeSession) => {
        session = activeSession;
      })
    );

    orchestrator.handleIntent(intent(1));
    session?.abort();
    expect(orchestrator.cursor()).toEqual({
      kind: 'hold',
      scene: 'brand',
      revision: 1
    });
    expect(locks).toEqual([true, false]);
    session?.complete();
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'hold',
      scene: 'brand'
    });
  });
});
