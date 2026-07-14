import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FakeElement, FakeVideo } from '../../transitions/__fixtures__/back-half.fixture';
import { parkPhMedia, phAnimationScene } from './index';

describe('PH media residency', () => {
  it('parks a prepared PH surface without downgrading preload or reloading metadata', () => {
    const root = new FakeElement();
    const video = new FakeVideo();
    const pause = vi.spyOn(video, 'pause');
    root.dataset.r4Scene = 'ph-animation';
    root.connect('[data-ph-alpha-video]', video);

    parkPhMedia(root as unknown as HTMLElement);

    expect(pause).toHaveBeenCalledOnce();
    expect(video.preload).toBe('auto');
    expect(video.loadCalls).toBe(0);
  });

  it('declares auto preload for the full mounted PH scene window', () => {
    const markup = renderToStaticMarkup(createElement(phAnimationScene.Component, {
      scene: 'ph-animation',
      hidden: false,
      role: 'next'
    }));

    expect(markup).toContain('data-ph-alpha-video="true"');
    expect(markup).toContain('preload="auto"');
  });
});
