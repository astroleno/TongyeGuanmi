import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { inventoryManifestSeed } from '../../story/manifest';
import { methodBottomScene } from '../method-bottom';
import { METHOD_COPY, METHOD_STEPS_COPY, METHOD_TOP_COPY, methodTopScene } from './index';

const stylesheet = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

describe('method-top copy baseline', () => {
  it('uses the R-1 method top split verbatim', () => {
    const method = inventoryManifestSeed.copySections.find((section) => section.sectionId === 'method');
    expect(method?.normalizedText.slice(0, METHOD_TOP_COPY.length)).toEqual([...METHOD_TOP_COPY]);
  });

  it('splits the intro and five steps into separate semantic holds', () => {
    const topMarkup = renderToStaticMarkup(createElement(methodTopScene.Component, {
      scene: 'method-top',
      hidden: false,
      role: 'current'
    }));
    const bottomMarkup = renderToStaticMarkup(createElement(methodBottomScene.Component, {
      scene: 'method-bottom',
      hidden: false,
      role: 'next'
    }));

    expect(topMarkup).toContain('data-r4-scene="method-top"');
    expect(topMarkup).not.toContain('data-reading-scrollport="true"');
    expect(topMarkup).not.toContain('class="r4-method__row"');
    expect(topMarkup).toContain('class="r4-method__wide"');
    expect(topMarkup).toContain('class="r4-method__wide-copy"');
    expect(topMarkup).toContain('class="r4-method__signals"');
    expect(bottomMarkup).toContain('data-r4-scene="method-bottom"');
    expect(bottomMarkup.match(/data-reading-scrollport="true"/g)).toHaveLength(1);
    expect(bottomMarkup).toContain('class="r4-method__vertical"');
    expect(bottomMarkup).toContain('class="r4-method__steps-lead"');
    expect(bottomMarkup).toContain('AI 落地五步');
    expect(bottomMarkup.match(/class="r4-method__row"/g)).toHaveLength(5);
    expect(stylesheet).toMatch(
      /\.r4-method__wide\s*\{[^}]*min-height:\s*100%/s
    );
    expect(stylesheet).toMatch(
      /\.r4-method__vertical\s*\{[^}]*grid-template-columns:\s*minmax\(/s
    );
    expect(stylesheet).not.toMatch(
      /\.r4-method__row\s*\{[^}]*border-(?:top|bottom)/s
    );
    expect(methodTopScene.staticFallback?.text).toEqual(METHOD_TOP_COPY);
    expect(methodBottomScene.staticFallback?.text).toEqual(METHOD_STEPS_COPY);
    expect(METHOD_COPY).toEqual([...METHOD_TOP_COPY, ...METHOD_STEPS_COPY]);
    expect(METHOD_STEPS_COPY).toHaveLength(15);
  });
});
