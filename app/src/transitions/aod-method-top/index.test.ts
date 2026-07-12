import { describe, expect, it } from 'vitest';
import { createAodMethodTopTransition } from '.';

describe('AOD Method transition media contract', () => {
  it('requires presented timeline media in both directions', () => {
    const contract = createAodMethodTopTransition().mediaPlayback?.[0];

    expect(contract?.forward).toMatchObject({ mode: 'timeline', required: true });
    expect(contract?.reverse).toMatchObject({ mode: 'timeline', required: true });
  });
});
