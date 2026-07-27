import { describe, expectTypeOf, it } from 'vitest';
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
});
