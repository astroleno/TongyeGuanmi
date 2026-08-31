import assert from 'node:assert/strict';
import { parseHeroPackedArgs, validateStagePath } from './rebuild-hero-packed-alpha-media.mjs';

const { test } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test');

test('Hero packed rebuild only stages output under the disposable directory', () => {
  assert.deepEqual(parseHeroPackedArgs([]), {
    stage: 'tmp/frame-lock-spike/figure1-rgb-alpha-promoted.mp4'
  });
  assert.equal(validateStagePath('tmp/frame-lock-spike/nested/hero.mp4'), 'tmp/frame-lock-spike/nested/hero.mp4');
  assert.throws(() => validateStagePath('assets/figure1-rgb-alpha.mp4'), /tmp\/frame-lock-spike/);
  assert.throws(() => parseHeroPackedArgs(['--stage', 'assets/replaced.mp4']), /tmp\/frame-lock-spike/);
  assert.throws(() => parseHeroPackedArgs(['--unknown']), /unknown hero packed option/);
});
