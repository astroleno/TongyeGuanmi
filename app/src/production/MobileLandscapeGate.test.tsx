import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MobileLandscapeGate } from './MobileLandscapeGate';

describe('MobileLandscapeGate', () => {
  it('does not render for bypassed or actively started experiences', () => {
    expect(renderToStaticMarkup(createElement(MobileLandscapeGate, {
      state: 'bypass',
      onStart: vi.fn()
    }))).toBe('');
    expect(renderToStaticMarkup(createElement(MobileLandscapeGate, {
      state: 'started',
      onStart: vi.fn()
    }))).toBe('');
  });

  it('blocks portrait phones before a stable landscape is ready', () => {
    const markup = renderToStaticMarkup(createElement(MobileLandscapeGate, {
      state: 'portrait-blocked',
      onStart: vi.fn()
    }));

    expect(markup).toContain('data-mobile-landscape-state="portrait-blocked"');
    expect(markup).toContain('请横屏浏览');
    expect(markup).not.toContain('开始浏览');
    expect(markup).toContain('role="dialog"');
  });

  it('requires the explicit start action after the landscape becomes stable', () => {
    const markup = renderToStaticMarkup(createElement(MobileLandscapeGate, {
      state: 'landscape-ready',
      onStart: vi.fn()
    }));

    expect(markup).toContain('data-mobile-landscape-state="landscape-ready"');
    expect(markup).toContain('画面已准备就绪。');
    expect(markup).toContain('<button type="button">开始浏览</button>');
  });

  it('uses a lighter status warning after the experience has started', () => {
    const markup = renderToStaticMarkup(createElement(MobileLandscapeGate, {
      state: 'portrait-warning',
      onStart: vi.fn()
    }));

    expect(markup).toContain('data-mobile-landscape-state="portrait-warning"');
    expect(markup).toContain('请转回横屏');
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain('开始浏览');
  });
});
