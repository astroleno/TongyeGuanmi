import { describe, expect, it } from 'vitest';
import {
  createPhoneStoryOrchestrator,
  type PhoneOrchestratedRunSession
} from './phone-story-orchestrator';

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
    session?.reportPresentedFrame();
    session?.reportEndpointCommit('receiver');
    session?.reportPresentedFrame();
    session?.reportAnimationComplete();

    expect(element.dataset).toMatchObject({
      phoneCursor: 'transition:brand-services:1',
      phoneTransitionPhase: 'verifying-target',
      phoneInputState: 'locked',
      phoneProjectionState: 'transition'
    });
    expect(element.dataset.phoneStableScene).toBeUndefined();
  });
});
