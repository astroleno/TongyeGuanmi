import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  ScenePresentationAdapterHandle,
  TransitionPresentationAdapterHandle
} from '../../story/presentation';
import type {
  PhoneCinematicRequest,
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';
import type { PhoneExecutionIdentity } from './phone-story-state';
import type { PhoneStoryRuntimePort } from './phone-story-orchestrator';

const contextSource = readFileSync(
  new URL('./PhoneStoryOrchestratorContext.tsx', import.meta.url),
  'utf8'
);

describe('phone presentation adapter contract', () => {
  it('uses the shared scene lifecycle instead of declaring a second copy', () => {
    expectTypeOf<PhoneSceneAdapterHandle>()
      .toEqualTypeOf<ScenePresentationAdapterHandle>();
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
    expectTypeOf<PhoneCinematicRequest['identity']>()
      .toEqualTypeOf<PhoneExecutionIdentity>();
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
