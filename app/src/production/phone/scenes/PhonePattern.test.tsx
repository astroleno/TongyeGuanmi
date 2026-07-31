import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  PhonePattern,
  phonePatternFrame,
  phonePatternStaticPresentationFrame
} from './PhonePattern';

const motionDriver = {
  set: () => undefined,
  quickTo: () => () => undefined,
  revealReadingSteps: () => () => undefined
};

describe('PhonePattern Route B adapter', () => {
  it('preserves the accepted Pattern DOM, copy, and bloom without a second edge plane', () => {
    const markup = renderToStaticMarkup(
      <PhonePattern
        active={false}
        reducedMotion={false}
        motionDriver={motionDriver}
      />
    );

    expect(markup).toContain(
      'class="portrait-scroll-spike__scene portrait-scroll-spike__scene--pattern"'
    );
    expect(markup).toContain('id="portrait-spike-pattern-title"');
    expect(markup).toContain('data-portrait-pattern-bloom="true"');
    expect(markup).not.toContain('toolbar-edge');
    expect(markup).toContain('让 AI 从一场培训，变成账上的数字。');
    expect(markup).not.toContain('phone-pattern__');
  });

  it('freezes the accepted collapse, copy, and wash progress mapping', () => {
    expect(phonePatternFrame(0)).toEqual({
      progress: 0,
      copyProgress: 0,
      copyY: 44,
      washOpacity: 0.54
    });
    expect(phonePatternFrame(0.78)).toMatchObject({
      progress: 0.78,
      copyProgress: 1,
      copyY: 0
    });
    const completed = phonePatternFrame(1);
    expect(completed).toMatchObject({
      progress: 1,
      copyProgress: 1,
      copyY: 0
    });
    expect(completed.washOpacity).toBeCloseTo(0.94, 8);
  });

  it("[Pattern↔StarMap reduced cutover] returns the leaf's exact immutable static-poster token", () => {
    const token = {
      authorityId: 'pattern-authority',
      sessionId: 'pattern-session',
      generation: 2,
      leg: 0,
      revision: 7,
      subject: 'front:pattern' as const,
      kind: 'static-poster' as const
    };

    const frame = phonePatternStaticPresentationFrame(token, 1, 42);

    expect(frame).toEqual({
      token,
      frameSequence: 1,
      observedAt: 42,
      origin: 'leaf-static-poster'
    });
    expect(frame.token).toBe(token);
  });

});
