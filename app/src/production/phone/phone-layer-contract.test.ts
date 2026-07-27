import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stageStyles = readFileSync(
  new URL('./PhoneStageRail.css', import.meta.url),
  'utf8'
);
const brandLabStyles = readFileSync(
  new URL('./PhoneBrandLabStory.css', import.meta.url),
  'utf8'
);
const labContactStyles = readFileSync(
  new URL('./PhoneLabContactContinuation.css', import.meta.url),
  'utf8'
);
const patternStyles = readFileSync(
  new URL('./scenes/PhonePattern.css', import.meta.url),
  'utf8'
);
const phStyles = readFileSync(
  new URL('../../scenes/ph-animation/phone/PhonePh.css', import.meta.url),
  'utf8'
);
const craneStyles = readFileSync(
  new URL('../../scenes/crane-animation/phone/PhoneCrane.css', import.meta.url),
  'utf8'
);
const nativeEndpointStyles = [
  '../../scenes/brand/phone/PhoneBrand.css',
  '../../scenes/services/phone/PhoneServices.css',
  '../../scenes/lab/phone/PhoneLab.css',
  '../../scenes/education/phone/PhoneEducation.css',
  '../../scenes/contact/phone/PhoneContact.css'
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));

describe('phone layer ownership contract', () => {
  it('keeps one fixed edge owner, stage, and semantic endpoint ladder', () => {
    expect(stageStyles).toMatch(
      /stage-rail::before[^}]*z-index:\s*8/s
    );
    expect(stageStyles).toMatch(
      /portrait-scroll-spike__stage\s*\{[^}]*z-index:\s*10/s
    );
    expect(stageStyles).toMatch(
      /phone-surface-role="retained-under-stage"[^}]*z-index:\s*9/s
    );
    expect(stageStyles).toMatch(
      /phone-surface-role="stable"[^}]*z-index:\s*11/s
    );
    expect(stageStyles).toMatch(
      /phone-surface-role="transition-receiver"[^}]*z-index:\s*12/s
    );
  });

  it('does not suppress Brand, Services, or Lab behind Grade A', () => {
    expect(brandLabStyles).not.toMatch(
      /\.phone-grade-a[\s\S]*?>\s*\.phone-brand-lab[\s\S]*?z-index:\s*0/
    );
  });

  it('[Task 8] derives visibility only from global roles and stage ownership', () => {
    expect(stageStyles).not.toContain('data-portrait-stage-active');
    expect(stageStyles).not.toContain('native-under-stage');
    expect(stageStyles).not.toContain('native-stable');
    expect(stageStyles).not.toContain('transition-endpoint');
    expect(labContactStyles).not.toMatch(/data-phone-group67-(stage-active|layer-active)/);
    expect(labContactStyles).not.toContain(':has(');
  });

  it('[Task 8] uses one fixed viewport box and opaque full-bleed coverage', () => {
    expect(stageStyles).toMatch(
      /portrait-scroll-spike__stage\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0/s
    );
    expect(stageStyles).not.toMatch(
      /portrait-scroll-spike__stage\s*\{[^}]*position:\s*fixed[^}]*(?:width|height|min-height):/s
    );
    expect(stageStyles).toMatch(
      /stage-rail::before\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0/s
    );
    expect(stageStyles).not.toMatch(
      /stage-rail::before\s*\{[^}]*position:\s*fixed[^}]*(?:width|height|min-height):/s
    );
    for (const styles of nativeEndpointStyles) {
      expect(styles).toContain('100svh');
      expect(styles).toContain('100dvh');
    }
    expect(patternStyles).not.toContain('linear-gradient(180deg');
    expect(phStyles).toMatch(/\.phone-ph\s*\{[^}]*background:\s*#9889a5/s);
    expect(craneStyles).toMatch(/\.phone-crane\s*\{[^}]*background:\s*#ede4d2/s);
  });
});
