import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gooModule = await import('../js/components/inkbleed-goo.js').catch(() => null);

test('Inkbleed keeps the original mask, choker, and goo constants', () => {
  assert.ok(gooModule, 'the native Inkbleed goo module must exist');
  assert.deepEqual(gooModule.INKBLEED_GOO_SETTINGS, {
    mainRadius: 0,
    secondaryRadius: 35,
    invert: true,
    blurAmount: 10,
    leftChokerOffset: -10,
    rightChokerOffset: 10,
    gooBlur: 6,
    threshold: 40,
    cutoff: -15,
    follow: .3,
    intensityFollow: .25
  });
});

test('Inkbleed builds the interaction from nested radial ink-drop strengths', () => {
  assert.ok(gooModule, 'the native Inkbleed goo module must exist');
  assert.deepEqual(gooModule.INKBLEED_RADIAL_LAYERS, [
    { name: 'far', radius: 1.18, inkBlur: 1, offset: 2, gooBlur: 1 },
    { name: 'middle', radius: .86, inkBlur: 4, offset: 5, gooBlur: 3 },
    { name: 'core', radius: .52, inkBlur: 8, offset: 8, gooBlur: 5 }
  ]);
});

test('ink-drop masks combine asymmetric lobes instead of a perfect circle', () => {
  assert.ok(gooModule, 'the native Inkbleed goo module must exist');
  const spot = gooModule.createInkDropMask({ radius: 1.18 });

  assert.equal((spot.match(/radial-gradient/g) ?? []).length, 4);
  assert.match(spot, /radial-gradient\(ellipse/);
  assert.match(spot, /calc\(var\(--mx, -9999px\) \+ calc\(/);
  assert.match(spot, /calc\(var\(--my, -9999px\) - calc\(/);
  assert.doesNotMatch(spot, /radial-gradient\(circle/);
  assert.match(spot, /rgba\(0,0,0,1\) 0%/);
  assert.match(spot, /transparent/);
});

test('ink-drop silhouette has a directional lower lobe instead of a dominant circular core', () => {
  assert.ok(gooModule, 'the native Inkbleed goo module must exist');
  assert.deepEqual(gooModule.INKBLEED_DROP_LOBES, [
    { x: 0, y: 0, width: .78, height: .66 },
    { x: .52, y: -.30, width: .50, height: .35 },
    { x: -.45, y: .38, width: .36, height: .66 },
    { x: .18, y: .56, width: .62, height: .28 }
  ]);
});

test('Inkbleed filter fuses the masked layers through the original alpha-threshold pipeline', () => {
  assert.ok(gooModule, 'the native Inkbleed goo module must exist');
  const filter = gooModule.createGooFilterMarkup('unit-test');

  assert.match(filter, /<feGaussianBlur[^>]+stdDeviation="6"[^>]+result="blur"/);
  assert.match(filter, /0 0 0 40 -15/);
  assert.match(filter, /operator="atop"/);
});

test('Inkbleed uses inverse masks: sharp outside the spot and liquid layers inside it', () => {
  assert.ok(gooModule, 'the native Inkbleed goo module must exist');
  const masks = gooModule.createInkMasks();

  assert.match(masks.sharp, /transparent 0%/);
  assert.match(masks.sharp, /rgba\(0,0,0,1\) 100%/);
  assert.match(masks.spot, /rgba\(0,0,0,1\) 0%/);
  assert.match(masks.spot, /transparent 100%/);
});

test('default Inkbleed keeps the resting glyph unfiltered and confines gooey ingredients to each liquid drop', async () => {
  const source = await readFile(new URL('../js/components/inkbleed-goo.js', import.meta.url), 'utf8');
  const defaultRenderer = source.slice(
    source.indexOf('export function mountInkbleedGoo'),
    source.indexOf('function createLayer')
  );

  assert.doesNotMatch(
    defaultRenderer,
    /content\.style\.filter/,
    'the shared content wrapper would melt the whole word even before a pointer enters'
  );
  assert.match(source, /liquid\.className = `inkbleed-goo__liquid inkbleed-goo__liquid--\$\{layer\.name\}`/);
  assert.match(source, /filterHost/);
  assert.match(source, /liquid\.style\.filter = `url\(#\$\{filterId\}\)`/);
  assert.match(source, /createInkDropMask\(\{ radius: layer\.radius \}\)/);
  assert.doesNotMatch(defaultRenderer, /setMask\(base,/);
  assert.match(source, /createLayer\(character, 'inkbleed-goo__sizer', true\)/);
  assert.match(source, /createLayer\(character, 'inkbleed-goo__blur', true\)/);
  assert.match(source, /liquidWrap\.append\(sizer, blur, left, right\)/);
});

test('the blur and choker copies share the original absolute left origin', async () => {
  const css = await readFile(new URL('../css/inkbleed-responsive-preview.css', import.meta.url), 'utf8');

  assert.match(
    css,
    /\.inkbleed-goo__blur,\s*\.inkbleed-goo__choker\s*\{[^}]*position:\s*absolute;[^}]*top:\s*0;[^}]*left:\s*0;/s
  );
});

test('Inkbleed preview styles do not create a shadow or floating treatment', async () => {
  const [responsiveCss, matrixCss] = await Promise.all([
    readFile(new URL('../css/inkbleed-responsive-preview.css', import.meta.url), 'utf8'),
    readFile(new URL('../css/inkbleed-font-matrix-preview.css', import.meta.url), 'utf8')
  ]);

  for (const css of [responsiveCss, matrixCss]) {
    assert.doesNotMatch(css, /(?:box-shadow|text-shadow|drop-shadow)/);
  }
});

test('the ink drop uses blurred source ingredients only inside an alpha-thresholded liquid group', async () => {
  const source = await readFile(new URL('../js/components/inkbleed-goo.js', import.meta.url), 'utf8');

  assert.match(source, /blur\.style\.filter = `blur\(\$\{layer\.inkBlur\}px\)`/);
  assert.match(source, /liquid\.style\.filter = `url\(#\$\{filterId\}\)`/);
  assert.doesNotMatch(source, /getRadialShift/);
});

test('Inkbleed prefers the shared local ink-diffusion renderer when WebGL is available', async () => {
  const source = await readFile(new URL('../js/components/inkbleed-goo.js', import.meta.url), 'utf8');

  assert.match(source, /from '\.\.\/effects\/ink-pointer-diffusion\.js'/);
  assert.match(source, /getInkPointerDiffusion\(\)/);
  assert.match(source, /host\.dataset\.inkbleedRenderer/);
  assert.match(source, /diffusion\.render\(/);
});

test('the glyph-anchored comparison creates one random seed per interaction and activates a three-character cluster', async () => {
  const source = await readFile(new URL('../js/components/inkbleed-goo.js', import.meta.url), 'utf8');

  assert.match(source, /const isGlyphAnchored = host\.dataset\.inkbleedVariant === 'glyph-anchored'/);
  assert.match(source, /const tracksCharacterBounds = !usesPointerDiffusion \|\| isGlyphAnchored/);
  assert.match(source, /gestureSeed = createGestureSeed\(\)/);
  assert.match(source, /getNeighborCharacterIndexes\(metrics, smooth\.x, smooth\.y\)/);
  assert.match(source, /activeCharacterIndexes/);
  assert.doesNotMatch(source, /mountDiscreteNeighborMorph/);
});
