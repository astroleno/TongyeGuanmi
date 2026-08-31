import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { test } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test');

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contract = JSON.parse(await readFile(
  path.join(appDir, 'scripts/frame-lock-eligibility-contract.json'),
  'utf8'
));

const segmentIds = [
  'hero-pattern', 'star-map-aod', 'aod-method-top', 'method-bottom-figure2',
  'figure2-distance-expand', 'brand-figure3', 'figure3-services',
  'services-ttg', 'ttg-lab', 'lab-ph', 'ph-education', 'education-crane',
  'crane-contact'
];
const knownDirections = new Set(
  segmentIds.flatMap((id) => [`${id}/forward`, `${id}/reverse`])
);
const craneDirections = new Set([
  'education-crane/forward', 'education-crane/reverse',
  'crane-contact/forward', 'crane-contact/reverse'
]);

function validate(value) {
  assert.equal(value.schemaVersion, 1);
  assert.match(value.approvalId, /^frame-lock-spike-/);
  assert.ok(['GO_FULL', 'GO_PARTIAL'].includes(value.decision));
  assert.ok(Array.isArray(value.eligibleDirections?.desktop));
  assert.ok(Array.isArray(value.eligibleDirections?.phone));
  const desktop = new Set(value.eligibleDirections.desktop);
  const phone = new Set(value.eligibleDirections.phone);
  for (const list of [value.eligibleDirections.desktop, value.eligibleDirections.phone]) {
    assert.equal(list.length, new Set(list).size, 'direction IDs must be unique');
    for (const id of list) assert.ok(knownDirections.has(id), `unknown direction: ${id}`);
  }
  for (const id of desktop) assert.ok(phone.has(id), `desktop/phone eligibility mismatch: ${id}`);
  for (const id of phone) assert.ok(desktop.has(id), `phone/desktop eligibility mismatch: ${id}`);
  const excluded = new Set(value.excludedDirections.map((entry) => entry.id));
  assert.equal(excluded.size, value.excludedDirections.length, 'excluded IDs must be unique');
  for (const id of excluded) {
    assert.ok(knownDirections.has(id), `unknown excluded direction: ${id}`);
    assert.ok(!desktop.has(id) && !phone.has(id), `eligible/excluded overlap: ${id}`);
  }
  const coveredByAtomicGroup = new Set();
  for (const group of value.atomicGroups) {
    assert.ok(group.id && Array.isArray(group.directions));
    for (const id of group.directions) {
      assert.ok(knownDirections.has(id), `unknown atomic direction: ${id}`);
      assert.ok(!coveredByAtomicGroup.has(id), `atomic direction overlap: ${id}`);
      coveredByAtomicGroup.add(id);
      assert.ok(desktop.has(id) && phone.has(id), `atomic direction is not fully eligible: ${id}`);
    }
    if (group.id === 'crane-figure-flock') {
      assert.deepEqual(new Set(group.directions), craneDirections);
    }
  }
  for (const exception of value.exceptions) {
    assert.ok(exception.id && exception.reason && exception.retryKey);
    assert.ok(knownDirections.has(exception.id), `unknown exception: ${exception.id}`);
    assert.ok(excluded.has(exception.id), `exception is not in excluded table: ${exception.id}`);
  }
}

test('the approved eligibility contract has no overlaps or unrecorded exceptions', () => {
  validate(contract);
});

test('Crane is one indivisible figure/flock atomic group', () => {
  const group = contract.atomicGroups.find((entry) => entry.id === 'crane-figure-flock');
  assert.deepEqual(new Set(group?.directions), craneDirections);
  assert.deepEqual(group?.media, ['crane-figure-motion', 'crane-flock-motion']);
});
