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
  phoneDirectEntryAdmissionStrategy,
  phoneRunLegAdmissionStrategy,
  phoneScenePresentationContract,
  phoneScenePresentationProofKind,
  phoneSegmentAdmissionStrategy,
  phoneSegmentPresentationContract
} from './phone-story/manifest';
import {
  canonicalSceneIds,
  canonicalSegments
} from '../../story/canonical-spine';
import { phoneIntentRuns } from './phone-story-runs';

const contextSource = readFileSync(
  new URL('./PhoneStoryRuntimeContext.tsx', import.meta.url),
  'utf8'
);
const presentationSource = readFileSync(
  new URL('./phone-story/presentation.ts', import.meta.url),
  'utf8'
);
const machineSource = readFileSync(
  new URL('./phone-story/machine.ts', import.meta.url),
  'utf8'
);
const engineSource = readFileSync(
  new URL('./phone-story/runtime/engine.ts', import.meta.url),
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
  it('[framework admission closure] derives every terminal proof from one manifest strategy in machine and runtime', () => {
    expect(machineSource).toContain('phoneScenePresentationProofKind(scene)');
    expect(engineSource).toContain('phoneScenePresentationProofKind(scene)');
    expect(machineSource).not.toContain('phoneDirectEntryPresentationProofKind');
    expect(engineSource).not.toContain('phoneDirectEntryPresentationProofKind');
  });

  it('[framework admission closure] makes DOM post-paint fallback manifest-owned, never receiver-name-owned', () => {
    expect(presentationSource).toContain('phoneDirectEntryAdmissionTuple(scene)');
    expect(presentationSource).toContain("admission[0] !== 'dom-post-paint'");
    expect(presentationSource).toContain('|| admission[6]');
    expect(presentationSource).not.toContain("receiver === 'front:pattern'");
    expect(presentationSource).not.toContain("receiver === 'front:star-map'");
  });

  it('[framework admission closure] declares every canonical segment direction and mode, plus every direct-entry target', () => {
    for (const { id, from, to } of canonicalSegments) {
      for (const direction of [1, -1] as const) {
        for (const mode of ['normal', 'reduced'] as const) {
          const admission = phoneSegmentAdmissionStrategy(id, direction, mode);
          expect(admission.targetScene).toBe(direction === 1 ? to : from);
          expect(admission.producer).toMatch(
            /^(effect-leaf|media-leaf|static-leaf|dom-post-paint)$/
          );
          expect(admission.kind).toMatch(
            /^(effect-frame|packed-canvas-frame|native-video-frame|static-poster|dom-reading)$/
          );
          expect(admission.subject).toMatch(/^[a-z0-9-]+:[a-z0-9-]+$/);
          expect(admission.landingResolver).toMatch(
            /^(front-corridor|aod-semantic-edge|authored-boundary|preserve-composite|native-reading)$/
          );
          expect(admission.effectRole).toMatch(/^(above-both|between|none)$/);
          expect(admission.requiresLeafAdapter).toBeTypeOf('boolean');
        }
      }
    }

    for (const run of phoneIntentRuns) {
      for (let legIndex = 0; legIndex < run.legs.length; legIndex += 1) {
        const leg = run.legs[legIndex]!;
        for (const direction of [1, -1] as const) {
          for (const mode of ['normal', 'reduced'] as const) {
            const admission = phoneRunLegAdmissionStrategy(
              run.id,
              legIndex,
              direction,
              mode
            );
            expect(admission).not.toBeNull();
            expect(admission?.targetScene).toBe(
              mode === 'normal'
                ? direction === 1 ? leg.to : leg.from
                : direction === 1 ? run.to : run.from
            );
          }
        }
      }
    }

    for (const scene of canonicalSceneIds) {
      const admission = phoneDirectEntryAdmissionStrategy(scene);
      expect(admission.targetScene).toBe(scene);
      expect(admission.producer).toMatch(
        /^(media-leaf|static-leaf|dom-post-paint)$/
      );
      expect(admission.kind).toMatch(
        /^(packed-canvas-frame|static-poster|dom-reading)$/
      );
      expect(phoneScenePresentationProofKind(scene)).toBe(admission.kind);
      expect(admission.subject).toBe(phoneScenePresentationContract(scene).receiverSurface);
      expect(admission.effectRole).toBe('none');
    }
  });

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
