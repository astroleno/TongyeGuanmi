import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const transitionSources = [
  'brand-figure3',
  'figure3-services',
  'services-ttg',
  'ttg-lab'
].map((id) => [
  id,
  readFileSync(new URL(`./${id}/phone.ts`, import.meta.url), 'utf8')
] as const);
const sharedInkAdapterSource = readFileSync(
  new URL('../production/phone/transitions/PhoneInkTransition.tsx', import.meta.url),
  'utf8'
);

describe('Group 4–5 explicit transition endpoint lifecycle', () => {
  it.each(transitionSources)(
    '%s retains endpoint geometry until the orchestrator releases it',
    (_id, source) => {
      const lifecycle = source.includes('createPhoneInkAdapter')
        ? `${source}\n${sharedInkAdapterSource}`
        : source;
      expect(lifecycle).toContain('PhoneTransitionAdapterHandle');
      expect(lifecycle).toContain('begin(');
      expect(lifecycle).toContain('commitEndpoint(');
      expect(lifecycle).toContain('releaseEndpoint');
    }
  );
});
