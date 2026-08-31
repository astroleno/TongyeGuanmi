import assert from 'node:assert/strict';

const { test } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test');

import {
  parseCandidateArgs,
  validateCandidateOutputPath
} from './rebuild-frame-lock-spike-candidates.mjs';

test('accepts only an exact frozen source key and the two allowed GOP values', () => {
  assert.deepEqual(
    parseCandidateArgs([
      '--source=assets/ph-figure-motion.webm',
      '--gop=8',
      '--output=tmp/frame-lock-spike/ph-gop8.webm'
    ]),
    {
      source: 'assets/ph-figure-motion.webm',
      gop: 8,
      output: 'tmp/frame-lock-spike/ph-gop8.webm'
    }
  );
  assert.equal(
    parseCandidateArgs([
      '--source', 'assets/ph-figure-motion-rgb-alpha.mp4',
      '--gop', '1',
      '--output', 'tmp/frame-lock-spike/ph-gop1.mp4'
    ]).gop,
    1
  );
  assert.throws(
    () => parseCandidateArgs([
      '--source=ph-figure-motion.webm',
      '--gop=8',
      '--output=tmp/frame-lock-spike/candidate.webm'
    ]),
    /allowlisted source/i
  );
  assert.throws(
    () => parseCandidateArgs([
      '--source=assets/ph-figure-motion.webm',
      '--gop=4',
      '--output=tmp/frame-lock-spike/candidate.webm'
    ]),
    /GOP must be 8 or 1/i
  );
});

test('rejects candidate outputs outside the repository tmp/frame-lock-spike directory', () => {
  assert.equal(
    validateCandidateOutputPath('tmp/frame-lock-spike/nested/candidate.webm'),
    'tmp/frame-lock-spike/nested/candidate.webm'
  );
  assert.throws(
    () => validateCandidateOutputPath('assets/replaced.webm'),
    /tmp\/frame-lock-spike/i
  );
  assert.throws(
    () => validateCandidateOutputPath('/tmp/frame-lock-spike/candidate.webm'),
    /repository tmp\/frame-lock-spike/i
  );
});
