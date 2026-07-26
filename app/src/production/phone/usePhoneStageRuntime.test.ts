import { describe, expect, it } from 'vitest';
import { createPhoneStoryHold, startPhoneStoryRun } from './phone-story-state';
import { phoneStageCursorOwnsAod } from './usePhoneStageRuntime';

describe('phone stage AOD ownership', () => {
  it('does not reacquire AOD after the orchestrator advances downstream', () => {
    expect(phoneStageCursorOwnsAod(
      createPhoneStoryHold('aod-animation')
    )).toBe(true);
    expect(phoneStageCursorOwnsAod(
      startPhoneStoryRun(
        createPhoneStoryHold('aod-animation'),
        'aod-method',
        1,
        { sessionId: 'aod-method', generation: 1 }
      )
    )).toBe(true);
    expect(phoneStageCursorOwnsAod(
      createPhoneStoryHold('method-top')
    )).toBe(false);
    expect(phoneStageCursorOwnsAod(
      createPhoneStoryHold('figure2-animation')
    )).toBe(false);
    expect(phoneStageCursorOwnsAod(
      createPhoneStoryHold('contact')
    )).toBe(false);
  });
});
