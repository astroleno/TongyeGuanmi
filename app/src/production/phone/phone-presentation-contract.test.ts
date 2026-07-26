import { describe, expectTypeOf, it } from 'vitest';
import type {
  ScenePresentationAdapterHandle,
  TransitionPresentationAdapterHandle
} from '../../story/presentation';
import type {
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';

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
  });
});
