import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fixtureCopySection } from '../../story/copy-baseline';
import { METHOD_COPY, METHOD_STEPS_COPY, METHOD_TOP_COPY, methodTopScene } from './index';

const stylesheet = [
  readFileSync(new URL('../../styles.css', import.meta.url), 'utf8'),
  readFileSync(new URL('../../production/editorial-layout.css', import.meta.url), 'utf8')
].join('\n');

describe('method-top copy baseline', () => {
  it('uses the R-1 method top split verbatim', () => {
    const method = fixtureCopySection('method');
    expect(method?.normalizedText.slice(0, METHOD_TOP_COPY.length)).toEqual([...METHOD_TOP_COPY]);
  });

  it('keeps the intro and five steps in one native reading scene', () => {
    const markup = renderToStaticMarkup(createElement(methodTopScene.Component, {
      scene: 'method-top',
      hidden: false,
      role: 'current'
    }));

    expect(markup).toContain('data-r4-scene="method-top"');
    expect(markup.match(/data-reading-scrollport="true"/g)).toHaveLength(1);
    expect(markup).toContain('class="r4-method__wide"');
    expect(markup).toContain('class="r4-method__wide-copy"');
    expect(markup).toContain('class="r4-method__signals"');
    expect(markup).toContain('class="r4-method__vertical"');
    expect(markup).toContain('class="r4-method__steps-lead"');
    expect(markup).toContain('AI 落地五步');
    expect(markup).not.toContain('01—05');
    expect(markup).toContain('<span>01</span>');
    expect(markup.match(/class="r4-method__row"/g)).toHaveLength(5);
    expect(stylesheet).toMatch(
      /\.r4-method__wide\s*\{[^}]*min-height:\s*100%/s
    );
    expect(stylesheet).toMatch(
      /\.r4-method__vertical,[\s\S]*?\.r4-education__vertical\s*\{[^}]*grid-template-columns:\s*minmax\(/s
    );
    expect(stylesheet).not.toMatch(
      /\.r4-method__row\s*\{[^}]*border-(?:top|bottom)/s
    );
    expect(stylesheet).toMatch(
      /\.r4-method__steps-lead h2,\s*\.r4-services__capability-lead h2\s*\{[^}]*font-size:\s*var\(--type-display-lead-size\);[^}]*white-space:\s*nowrap/s
    );
    expect(stylesheet).not.toMatch(
      /\.r4-method__steps-lead h2\s*\{[^}]*max-width:\s*5em/s
    );
    expect(methodTopScene.staticFallback?.text).toEqual(METHOD_COPY);
    expect(METHOD_COPY).toEqual([...METHOD_TOP_COPY, ...METHOD_STEPS_COPY]);
    expect(METHOD_STEPS_COPY).toHaveLength(15);
    expect(stylesheet).toMatch(
      /@media \(orientation: landscape\)[\s\S]*?\.r4-method__row,[\s\S]*?grid-template-columns:\s*38px minmax\(0, 1fr\)/s
    );
    expect(stylesheet).toMatch(
      /@media[\s\S]*?\(orientation: portrait\)[\s\S]*?\.r4-method__vertical\s*\{[^}]*padding-top:\s*96px/s
    );
  });
});
