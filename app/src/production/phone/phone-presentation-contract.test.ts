import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  ScenePresentationAdapterHandle,
  TransitionPresentationAdapterHandle
} from '../../story/presentation';
import type {
  PhoneCinematicRequest,
  PhonePresentationAdapterHandle,
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';
import type { PhoneExecutionToken } from './phone-story/machine';
import type { PhoneStoryRuntimePort } from './phone-story/runtime';
import {
  phoneScenePresentationContract,
  phoneSegmentPresentationContract
} from './phone-story/manifest';
import {
  canonicalSceneIds,
  canonicalSegments
} from '../../story/canonical-spine';

const contextSource = readFileSync(
  new URL('./PhoneStoryRuntimeContext.tsx', import.meta.url),
  'utf8'
);

describe('phone presentation adapter contract', () => {
  it('extends the shared scene lifecycle only with the token-bound frame bridge', () => {
    expectTypeOf<PhoneSceneAdapterHandle>()
      .toMatchTypeOf<ScenePresentationAdapterHandle>();
    expectTypeOf<PhoneSceneAdapterHandle>()
      .toMatchTypeOf<Partial<PhonePresentationAdapterHandle>>();
  });

  it('uses the shared transition lifecycle instead of declaring a second copy', () => {
    expectTypeOf<PhoneTransitionAdapterHandle>()
      .toMatchTypeOf<TransitionPresentationAdapterHandle>();
    expectTypeOf<PhoneTransitionAdapterHandle['begin']>()
      .toBeFunction();
    expectTypeOf<PhoneTransitionAdapterHandle['commitEndpoint']>()
      .toBeFunction();
    expectTypeOf<PhoneTransitionAdapterHandle['releaseEndpoint']>()
      .toBeFunction();
    expectTypeOf<Parameters<PhoneTransitionAdapterHandle['begin']>[0]>()
      .toEqualTypeOf<PhoneCinematicRequest>();
    expectTypeOf<PhoneCinematicRequest>()
      .toEqualTypeOf<PhoneExecutionToken>();
  });

  it('[Task 9] exposes only the snapshot runtime port through Context', () => {
    type HiddenLifecycle = Extract<
      keyof PhoneStoryRuntimePort,
      'attach' | 'dispose' | 'cursor'
    >;

    expectTypeOf<HiddenLifecycle>().toEqualTypeOf<never>();
    expect(contextSource).toContain(
      'createContext<PhoneStoryRuntimePort | null>(null)'
    );
    expect(contextSource).toContain('value={authority.port}');
    expect(contextSource).not.toContain('value={authority}');
  });
});

describe('R5 canonical presentation manifest', () => {
  it('gives every canonical hold an explicit receiver, coverage owner, and real direct-entry probe', () => {
    for (const scene of canonicalSceneIds) {
      const contract = phoneScenePresentationContract(scene);
      expect(contract.receiverSurface).toMatch(/^[a-z0-9-]+:[a-z0-9-]+$/);
      expect(contract.coverageSurface).toMatch(/^[a-z0-9-]+:[a-z0-9-]+$/);
      expect(['reading', 'static', 'static-visual', 'visual']).toContain(contract.contentProbe.kind);
      if (contract.contentProbe.kind === 'visual') {
        expect(contract.contentProbe.frameSelectors).toEqual([]);
      } else if (contract.contentProbe.kind === 'static-visual') {
        expect(contract.contentProbe.frameSelectors.length).toBeGreaterThan(0);
      } else {
        expect(contract.contentProbe.textSelectors.length).toBeGreaterThan(0);
      }
    }
  });

  it('gives every canonical segment explicit endpoints, frame proof, effect host, and bidirectional policy', () => {
    for (const { id, from, to } of canonicalSegments) {
      const contract = phoneSegmentPresentationContract(id);
      expect(contract.from).toBe(from);
      expect(contract.to).toBe(to);
      expect(contract.sourceSurface).toMatch(/^[a-z0-9-]+:[a-z0-9-]+$/);
      expect(contract.receiverSurface).toMatch(/^[a-z0-9-]+:[a-z0-9-]+$/);
      expect(contract.effectHost).toMatch(/^[a-z0-9-]+:[a-z0-9-]+$/);
      expect(contract.effectPlacement).toMatch(/^(above-both|between|inside-owner)$/);
      expect(contract.firstFrame.kind).toMatch(/^(effect-frame|packed-canvas-frame)$/);
      expect(contract.firstFrame.subject).toMatch(/^[a-z0-9-]+:[a-z0-9-]+$/);
      expect(contract.forward.policy).toBe('fail-closed');
      expect(contract.reverse.policy).toBe('fail-closed');
    }
  });

  it('[R5] lands every post-composite reading hold on authored document content', () => {
    expect(phoneScenePresentationContract('services').landingResolver)
      .toBe('native-reading');
    expect(phoneScenePresentationContract('lab').landingResolver)
      .toBe('native-reading');
    expect(phoneScenePresentationContract('education').landingResolver)
      .toBe('native-reading');
  });
});
