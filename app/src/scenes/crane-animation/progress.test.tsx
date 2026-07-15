import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { craneAnimationScene } from '.';

describe('Crane animation presentation', () => {
  it('uses the corrected canonical frame-zero still only as the flock video poster', () => {
    const Scene = craneAnimationScene.Component;
    const markup = renderToStaticMarkup(<Scene scene="crane-animation" hidden={false} />);

    expect(markup).toContain('crane-flock-first-frame.webp');
    expect(markup).toContain('crane-flock-motion.webm');
    expect(markup).toMatch(/data-crane-figure-front-video[^>]+poster=/);
    expect(markup).not.toContain('data-crane-flock-poster-overlay');
  });
});
