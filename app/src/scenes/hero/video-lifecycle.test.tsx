// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { heroScene } from './index';
import type { SceneComponentProps } from '../../story/types';

const props: SceneComponentProps = { scene: 'hero', hidden: false, role: 'current',
  presentation: { heroIntroMode: 'endpoint', reducedMotion: true } };
let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null; host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('Hero decoder ownership at resource-window eviction', () => {
  it('releases the captured detached node after React has cleared its figure ref', async () => {
    const handle = vi.fn();
    await act(async () => root!.render(createElement(heroScene.Component, { ...props, registerHandle: handle })));
    const video = host.querySelector('video')!;
    expect(video.querySelectorAll('source[src]')).toHaveLength(2);
    video.setAttribute('src', '/selected-hero.webm');
    await act(async () => root!.render(null));
    expect(handle.mock.calls.filter(([name]) => name === 'figure').at(-1)?.[1]).toBeNull();
    expect(video.isConnected).toBe(false);
    expect(video.hasAttribute('src')).toBe(false);
    expect(video.querySelectorAll('source[src]')).toHaveLength(0);
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledOnce();
    expect(vi.mocked(HTMLMediaElement.prototype.load).mock.contexts[0]).toBe(video);
  });
  it('does not clear or reload a live node during StrictMode effect replay', async () => {
    await act(async () => root!.render(createElement(StrictMode, null, createElement(heroScene.Component, props))));
    const video = host.querySelector('video')!;
    expect(video.isConnected).toBe(true);
    expect(video.querySelectorAll('source[src]')).toHaveLength(2);
    expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
  });
  it('keeps the decoder when a retained scene is hidden or rerendered', async () => {
    await act(async () => root!.render(createElement(heroScene.Component, props)));
    const video = host.querySelector('video')!;
    await act(async () => root!.render(createElement(heroScene.Component, { ...props, hidden: true })));
    expect(host.querySelector('video')).toBe(video);
    expect(video.querySelectorAll('source[src]')).toHaveLength(2);
    expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
  });
  it('releases only the evicted node and preserves the fresh sources on reverse remount', async () => {
    await act(async () => root!.render(createElement(heroScene.Component, props)));
    const previous = host.querySelector('video')!;
    await act(async () => root!.render(null));
    await act(async () => root!.render(createElement(heroScene.Component, props)));
    const current = host.querySelector('video')!;
    expect(current).not.toBe(previous);
    expect(previous.querySelectorAll('source[src]')).toHaveLength(0);
    expect(current.querySelectorAll('source[src]')).toHaveLength(2);
    expect(vi.mocked(HTMLMediaElement.prototype.load).mock.contexts).toEqual([previous]);
  });
});
