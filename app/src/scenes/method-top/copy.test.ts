import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { inventoryManifestSeed } from '../../story/manifest';
import { METHOD_COPY, METHOD_STEPS_COPY, METHOD_TOP_COPY, methodTopScene } from './index';

describe('method-top copy baseline', () => {
  it('uses the R-1 method top split verbatim', () => {
    const method = inventoryManifestSeed.copySections.find((section) => section.sectionId === 'method');
    expect(method?.normalizedText.slice(0, METHOD_TOP_COPY.length)).toEqual([...METHOD_TOP_COPY]);
  });

  it('renders the intro and all five steps inside one scene-owned reading scrollport', () => {
    const markup = renderToStaticMarkup(createElement(methodTopScene.Component, {
      scene: 'method-top',
      hidden: false,
      role: 'current'
    }));

    expect(markup).toContain('data-r4-scene="method-top"');
    expect(markup.match(/data-reading-scrollport="true"/g)).toHaveLength(1);
    expect(markup.match(/class="r4-method__row"/g)).toHaveLength(5);
    expect(markup).not.toContain('data-r4-scene="method-bottom"');
    expect(methodTopScene.staticFallback?.text).toEqual(METHOD_COPY);
    expect(METHOD_STEPS_COPY).toHaveLength(15);
  });
});
