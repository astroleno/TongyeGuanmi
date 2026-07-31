import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  PhoneStarMap,
  phoneStarMapStaticPresentationFrame
} from './PhoneStarMap';

const motionDriver = {
  set: () => undefined,
  quickTo: () => () => undefined,
  revealReadingSteps: () => () => undefined
};

describe('PhoneStarMap Route B adapter', () => {
  it('preserves the fixed Star Map root while its active prop stays resource-only', () => {
    const markup = renderToStaticMarkup(
      <PhoneStarMap active={false} reducedMotion={false} motionDriver={motionDriver} />
    );

    expect(markup).toContain(
      'class="portrait-scroll-spike__scene portrait-scroll-spike__scene--star"'
    );
    expect(markup).toContain('data-portrait-star-perlin="true"');
    expect(markup).toContain('id="portrait-spike-star-title"');
  });

  it('[Pattern↔StarMap reduced cutover] returns the leaf\'s exact immutable static-poster token', () => {
    const token = {
      authorityId: 'star-authority',
      sessionId: 'star-session',
      generation: 3,
      leg: 1,
      revision: 8,
      subject: 'front:star-map' as const,
      kind: 'static-poster' as const
    };

    const frame = phoneStarMapStaticPresentationFrame(token, 2, 84);

    expect(frame).toEqual({
      token,
      frameSequence: 2,
      observedAt: 84,
      origin: 'leaf-static-poster'
    });
    expect(frame.token).toBe(token);
  });
});
