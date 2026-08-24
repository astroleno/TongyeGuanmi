import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const matrixPage = new URL('../inkbleed-font-matrix-preview.html', import.meta.url);
const matrixScript = new URL('../js/inkbleed-font-matrix-preview.js', import.meta.url);
const responsivePage = new URL('../inkbleed-responsive-preview.html', import.meta.url);
const responsiveScript = new URL('../js/inkbleed-responsive-preview.js', import.meta.url);

test('the font matrix covers the three project typography systems through one shared Inkbleed implementation', async () => {
  const pageExists = await access(matrixPage).then(() => true, () => false);
  const scriptExists = await access(matrixScript).then(() => true, () => false);

  assert.equal(pageExists, true, 'the dedicated font matrix preview must exist');
  assert.equal(scriptExists, true, 'the font matrix interaction script must exist');

  const [html, script] = await Promise.all([
    readFile(matrixPage, 'utf8'),
    readFile(matrixScript, 'utf8')
  ]);

  assert.match(html, /data-font-system="tongye-title"/);
  assert.match(html, /data-font-system="ui-sans"/);
  assert.match(html, /data-font-system="editorial-serif"/);
  assert.match(html, /Tongye Title/);
  assert.match(html, /SF Pro Display/);
  assert.match(html, /Songti SC/);
  assert.match(script, /mountInkbleedGoo/);
});

test('the previews describe local transition-style ink diffusion, not displacement or a floating shadow', async () => {
  const [matrixHtml, responsiveHtml, responsiveJs] = await Promise.all([
    readFile(matrixPage, 'utf8'),
    readFile(responsivePage, 'utf8'),
    readFile(responsiveScript, 'utf8')
  ]);

  assert.match(matrixHtml, /局部 Ink 扩散/);
  assert.match(matrixHtml, /转场/);
  assert.doesNotMatch(matrixHtml, /三层同心径向墨滴/);
  assert.doesNotMatch(matrixHtml, /Goo 融合/);
  assert.doesNotMatch(matrixHtml, /外拉/);
  assert.doesNotMatch(responsiveHtml, /浮墨|融合成一团墨|外拉/);
  assert.match(responsiveHtml, /局部 Ink 扩散/);
  assert.doesNotMatch(responsiveHtml, /同一组径向墨滴语言/);
  assert.doesNotMatch(responsiveJs, /融合效果/);
  assert.match(responsiveJs, /局部 Ink 扩散/);
});

test('the matrix replaces the abandoned discrete mode with a seeded glyph-anchored comparison', async () => {
  const [html, css] = await Promise.all([
    readFile(matrixPage, 'utf8'),
    readFile(new URL('../css/inkbleed-font-matrix-preview.css', import.meta.url), 'utf8')
  ]);

  assert.match(html, /font-card--glyph-anchored/);
  assert.match(html, /data-inkbleed-variant="glyph-anchored"/);
  assert.match(html, /Glyph-anchored Ink/);
  assert.match(html, /字形边缘锚定/);
  assert.match(css, /\.font-card--glyph-anchored\s*\{/);
  assert.doesNotMatch(html, /discrete-neighbors/);
  assert.doesNotMatch(css, /inkbleed-goo--discrete/);
});
