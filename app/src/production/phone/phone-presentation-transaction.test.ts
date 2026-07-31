import { describe, expect, it } from 'vitest';
import {
  createPhoneStoryRuntimeEngine as createPhoneStoryOrchestrator,
  type PhoneOrchestratedRunSession
} from './phone-story/runtime/engine';
import {
  phoneScenePresentationTuple,
  phoneSegmentPresentationTuple
} from './phone-story/manifest';

function reportSegmentProof(
  session: PhoneOrchestratedRunSession,
  segment: Parameters<typeof phoneSegmentPresentationTuple>[0]
): void {
  const contract = phoneSegmentPresentationTuple(segment);
  const token = session.presentationProofToken(contract[8], contract[9]);
  if (!token) throw new Error('Expected an active segment proof token');
  session.reportPresentationProof({
    token,
    frameSequence: 1,
    observedAt: 1,
    connected: true,
    visible: true,
    coverageComplete: true,
    edge: phoneScenePresentationTuple(contract[3])[1]
  });
}

function root(): HTMLElement {
  const styles = new Map<string, string>();
  return {
    dataset: {} as DOMStringMap,
    style: {
      setProperty(name: string, value: string) {
        styles.set(name, value);
      },
      removeProperty(name: string) {
        styles.delete(name);
      },
      getPropertyValue(name: string) {
        return styles.get(name) ?? '';
      }
    }
  } as unknown as HTMLElement;
}

describe('phone presentation transaction', () => {
  it('publishes the target as a locked candidate before the final stable hold', () => {
    const element = root();
    let session: PhoneOrchestratedRunSession | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root: element,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.registerRunCapability('brand-services', 'test', {
      position: () => 100,
      canStart: () => true,
      start: (_direction, activeSession) => {
        session = activeSession;
      }
    });
    orchestrator.registerScrollCorridor({
      id: 'presentation',
      scenes: ['brand', 'services'],
      sample: () => null,
      boundary: () => 100,
      landing: () => 100
    });

    expect(orchestrator.resolveIntent([1, 1, 0, 120])).toBe('claim-boundary');
    if (session) reportSegmentProof(session, 'brand-figure3');
    session?.reportEndpointCommit('receiver');
    if (session) reportSegmentProof(session, 'figure3-services');
    session?.reportAnimationComplete();

    expect(element.dataset).toMatchObject({
      phoneCursor: 'transition:brand-services:1',
      phoneTransitionPhase: 'verifying-target',
      phoneInputState: 'locked',
      phoneProjectionState: 'candidate'
    });
    expect(element.dataset.phoneStableScene).toBeUndefined();
  });
});
