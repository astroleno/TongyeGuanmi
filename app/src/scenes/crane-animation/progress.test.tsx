import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { craneAnimationScene } from '.';

describe('Crane animation presentation', () => {
  it('uses exactly the figure and corrected canonical flock videos with no still surface', () => {
    const Scene = craneAnimationScene.Component;
    const markup = renderToStaticMarkup(<Scene scene="crane-animation" hidden={false} />);

    expect(markup).toContain('crane-figure-motion.webm');
    expect(markup).toContain('crane-figure-motion-hevc-alpha.mp4');
    expect(markup).toContain('crane-flock-motion.webm');
    expect(markup).toContain('crane-flock-motion-hevc-alpha.mp4');
    expect(markup.match(/data-alpha-video-format="hevc"/g)).toHaveLength(2);
    expect(markup.match(/data-alpha-video-format="webm"/g)).toHaveLength(2);
    expect(markup.match(/<video/g)).toHaveLength(2);
    expect(markup).not.toContain('poster=');
    expect(markup).not.toContain('crane-flock-first-frame.webp');
  });
});
