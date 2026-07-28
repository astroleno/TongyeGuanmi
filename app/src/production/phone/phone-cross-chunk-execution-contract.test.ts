import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const phoneRoot = new URL('./', import.meta.url);
const source = (relative: string) => readFileSync(
  new URL(relative, phoneRoot),
  'utf8'
);
const phoneSourceFiles = (directory: string): string[] => readdirSync(directory, {
  withFileTypes: true
}).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return phoneSourceFiles(path);
  return /\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)
    ? [path]
    : [];
});
const phoneDirectory = new URL('./', import.meta.url).pathname;
const coreIdentityOwners = new Set([
  'phone-story-state.ts',
  'phone-story-orchestrator.ts',
  'phone-orchestrated-session.ts'
].map((file) => join(phoneDirectory, file)));
const lazyExecutionSources = [
  '../../scenes/figure3-animation/phone/PhoneFigure3.tsx',
  '../../scenes/ttg-animation/phone/PhoneTtg.tsx',
  '../../scenes/ph-animation/phone/PhonePh.tsx',
  '../../scenes/crane-animation/phone/PhoneCrane.tsx'
];
const bridgeSource = (relative: string) => source(relative);

describe('phone cross-chunk execution contracts', () => {
  it('defines execution identity, requests, samples, and DOM media evidence as positional protocols', () => {
    expect(source('phone-story-state.ts')).toContain(
      'export type PhoneExecutionToken = readonly ['
    );
    expect(source('phone-transition-coordinator.ts')).toContain(
      'export type PhoneIntent = readonly ['
    );
    expect(source('phone-transition-coordinator.ts')).toContain('return onIntent([');
    expect(source('phone-transition-coordinator.ts')).not.toContain('onIntent({');
    expect(source('phone-story-runtime.ts')).toContain(
      'export type PhoneCinematicSnapshot = readonly ['
    );
    expect(source('phone-story-runtime.ts')).toContain(
      'export type PhoneCompositeSession = readonly ['
    );
    expect(source('phone-story-runtime.ts')).toContain(
      'export type PhoneRuntimeScrollSample = readonly ['
    );
    expect(source('usePhoneDocumentScrollRuntime.ts')).toContain(
      'export type PhoneDocumentScrollSample = readonly ['
    );
    expect(source('phone-stage-timeline.ts')).toContain(
      'export type PhoneStageFrame = readonly ['
    );
    expect(source('phone-story-runtime.ts')).toContain(
      'export function reportPhoneRuntimeScrollSample('
    );
    expect(source('types.ts')).toContain(
      'export type PhoneCinematicRequest = PhoneExecutionToken;'
    );
    expect(source('phone-lab-contact-timeline.ts')).toContain(
      'export type PhoneLabContactAutoplayEvent = readonly ['
    );
    expect(bridgeSource('../../transitions/figure2-distance-expand/index.ts')).toContain(
      'export type PhoneFigure2DistanceExpandBridgeRequest = readonly ['
    );
    expect(source('phone-ink.ts')).toContain(
      'export type PhoneInkTransitionRequest = readonly ['
    );
    expect(source('transitions/PhoneInkTransition.tsx')).toContain(
      'export type PhoneInkAdapterRequest = readonly ['
    );
    expect(source('scenes/usePhoneCinematicRun.ts')).toContain(
      'export type PhoneCinematicRunRequest = readonly ['
    );
    expect(bridgeSource('../../transitions/shared/phone-ink-runtime.ts')).toContain(
      'export type PhoneInkRuntimeRequest = readonly ['
    );
    expect(bridgeSource('../../transitions/shared/phone-ink-runtime.ts')).toContain(
      'export type PhoneFigure2DepthInkRuntimeRequest = readonly ['
    );
    expect(bridgeSource('../../transitions/shared/phone-ink-runtime.ts')).toContain(
      'export type PhoneHeroRadialInkRequest = readonly ['
    );
  });

  it('keeps raw authority identity objects inside the authority core', () => {
    const offenders = phoneSourceFiles(phoneDirectory).filter((file) => (
      !coreIdentityOwners.has(file)
      && readFileSync(file, 'utf8').includes('PhoneExecutionIdentity')
    ));
    for (const relative of lazyExecutionSources) {
      const file = new URL(relative, phoneRoot).pathname;
      if (readFileSync(file, 'utf8').includes('PhoneExecutionIdentity')) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('forbids raw object event and request payloads at lazy execution boundaries', () => {
    const boundarySources = [
      'usePhoneStageRuntime.ts',
      'phone-composite-runner.ts',
      'phone-grade-a-runtime.ts',
      'phone-lab-contact-timeline.ts',
      'usePhoneDocumentScrollRuntime.ts'
    ];
    for (const relative of boundarySources) {
      const text = source(relative);
      expect(text).not.toMatch(/\.dispatch\(\s*\{/);
      expect(text).not.toContain('begin({ identity:');
    }
  });

  it('keeps lazy adapters on positional commands instead of raw factory and timeline objects', () => {
    const executionSources = [
      'transitions/figure2-distance-expand.tsx',
      'transitions/PhoneInkTransition.tsx',
      'transitions/hero-pattern.tsx',
      'transitions/pattern-star-map.tsx',
      'transitions/star-map-aod.tsx',
      'transitions/method-bottom-figure2.ts',
      'transitions/figure2-proof-brand.ts',
      '../../transitions/brand-figure3/phone.ts',
      '../../transitions/services-ttg/phone.ts',
      '../../transitions/lab-ph/phone.ts',
      '../../transitions/ph-education/phone.ts',
      '../../transitions/education-crane/phone.ts',
      '../../transitions/crane-contact/phone.ts',
      '../../scenes/figure3-animation/phone/PhoneFigure3.tsx',
      '../../scenes/figure3-animation/phone/paper-compositor.ts',
      '../../scenes/figure3-animation/phone/reverse-playback.ts',
      '../../scenes/ttg-animation/phone/PhoneTtg.tsx',
      '../../scenes/ph-animation/phone/PhonePh.tsx',
      '../../scenes/ph-animation/phone/PhonePh.reverse.ts',
      '../../scenes/crane-animation/phone/PhoneCrane.tsx',
      '../../scenes/crane-animation/phone/PhoneCrane.autoplay.ts'
    ];
    const rawCalls = [
      /\b(?:create|use)Phone[A-Za-z0-9_]*\s*\(\s*\{/,
      /\.buildTimeline\s*\(\s*\{/,
      /\bcreateFigure2DistanceExpandTransition\s*\(\s*\{/
    ];
    for (const relative of executionSources) {
      const text = bridgeSource(relative);
      for (const rawCall of rawCalls) {
        expect(text).not.toMatch(rawCall);
      }
    }
    const figure2Adapter = source('transitions/figure2-distance-expand.tsx');
    expect(figure2Adapter).toContain('createPhoneFigure2DistanceExpandBridge([');
    expect(figure2Adapter).not.toContain('TransitionContext');
    const phoneInk = source('phone-ink.ts');
    const figure2 = bridgeSource('../../transitions/figure2-distance-expand/index.ts');
    const hero = source('scenes/PhoneHero.tsx');
    for (const text of [phoneInk, figure2]) {
      expect(text).not.toMatch(
        /\b(?:createInkFieldRenderer|mountTransitionInkCanvas|createInkFieldFrame)\s*\(/
      );
    }
    expect(hero).toContain('createPhoneHeroRadialInkBridge([');
    expect(hero).not.toContain('createRadialInkIntroController({');
  });
});
