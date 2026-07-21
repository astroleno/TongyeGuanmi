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
  }, () => calls.push(`ownership:${frame.ownership.key}`));
  return calls;
}

describe('phone transition endpoint ownership order', () => {
  it('lets only Hero → Pattern write Pattern after ownership is committed', () => {
    expect(renderTrace(0.205)).toEqual([
      'pattern-star:0.0000',
      'star-aod:0.0000',
      'ownership:handoff-hero-pattern',
      'hero-pattern:0.5000'
    ]);
  });

  it('preserves the same ordering for both later adjacent handoffs', () => {
    expect(renderTrace(0.565)).toEqual([
      'hero-pattern:1.0000',
      'star-aod:0.0000',
      'ownership:handoff-pattern-star',
      'pattern-star:0.5000'
    ]);
    expect(renderTrace(0.755)).toEqual([
      'hero-pattern:1.0000',
      'pattern-star:1.0000',
      'ownership:handoff-star-aod',
      'star-aod:0.5000'
    ]);
  });

  it('clears every terminal boundary before committing a held scene', () => {
    expect(renderTrace(0.3)).toEqual([
      'hero-pattern:1.0000',
      'pattern-star:0.0000',
      'star-aod:0.0000',
      'ownership:hold-pattern'
    ]);
  });
});
