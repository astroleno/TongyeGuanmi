import { describe, expect, it } from 'vitest';
import { phoneStageFrame } from './phone-stage-timeline';
import { renderPhoneStageTransitions } from './phone-transition-stage';

function renderTrace(progress: number): string[] {
  const calls: string[] = [];
  const frame = phoneStageFrame(progress);
  const renderer = (id: string) => ({
    render(value: number) {
      calls.push(`${id}:${value.toFixed(4)}`);
    }
  });
  renderPhoneStageTransitions(frame, {
    heroPattern: renderer('hero-pattern'),
    patternStar: renderer('pattern-star'),
    starAod: renderer('star-aod')
  });
  return calls;
}

describe('phone transition adapter rendering', () => {
  it('renders the active Hero → Pattern adapter after inactive terminals', () => {
    expect(renderTrace(0.205)).toEqual([
      'pattern-star:0.0000',
      'star-aod:0.0000',
      'hero-pattern:0.5000'
    ]);
  });

  it('preserves the same ordering for both later adjacent handoffs', () => {
    expect(renderTrace(0.565)).toEqual([
      'hero-pattern:1.0000',
      'star-aod:0.0000',
      'pattern-star:0.5000'
    ]);
    expect(renderTrace(0.755)).toEqual([
      'hero-pattern:1.0000',
      'pattern-star:1.0000',
      'star-aod:0.5000'
    ]);
  });

  it('renders every terminal adapter for a held scene without owning visibility', () => {
    expect(renderTrace(0.3)).toEqual([
      'hero-pattern:1.0000',
      'pattern-star:0.0000',
      'star-aod:0.0000'
    ]);
  });
});
