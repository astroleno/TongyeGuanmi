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
const phoneCrossChunkContract = JSON.parse(
  readFileSync(
    new URL('../../../build/phone-cross-chunk-contract.json', phoneRoot),
    'utf8'
  )
) as {
  reservedPropertyNames: readonly string[];
  dynamicPropertyNames?: readonly string[];
};
const viteConfigSource = readFileSync(
  new URL('../../../vite.config.ts', phoneRoot),
  'utf8'
);
const coreIdentityOwners = new Set([
  'phone-story/machine.ts',
  'phone-story/runtime/engine.ts',
  'phone-story/runtime/session.ts'
].map((file) => join(phoneDirectory, file)));
const lazyExecutionSources = [
  '../../scenes/figure3-animation/phone/PhoneFigure3.tsx',
  '../../scenes/ttg-animation/phone/PhoneTtg.tsx',
  '../../scenes/ph-animation/phone/PhonePh.tsx',
  '../../scenes/crane-animation/phone/PhoneCrane.tsx'
];
const bridgeSource = (relative: string) => source(relative);
const timelineDriverSource = bridgeSource('../../media/timeline-video-driver.ts');

describe('phone cross-chunk execution contracts', () => {
  it('keeps canonical dynamic scene keys out of property mangling', () => {
    const dynamicPropertyNames = phoneCrossChunkContract.dynamicPropertyNames ?? [];
    expect(dynamicPropertyNames).toEqual([
      'hero',
      'pattern',
      'star',
      'aod',
      'method',
      'figure2',
      'proof',
      'brand',
      'figure3',
      'services',
      'ttg',
      'lab',
      'ph',
      'education',
      'crane',
      'contact'
    ]);
    for (const propertyName of dynamicPropertyNames) {
      expect(phoneCrossChunkContract.reservedPropertyNames).toContain(propertyName);
    }
    expect(viteConfigSource).not.toMatch(/(?:^|\|)aod(?:\||\$)/);
  });

  it('reserves the complete TextReveal prop ABI used by lazy phone scenes', () => {
    for (const propertyName of [
      'active',
      'as',
      'blurPx',
      'children',
      'delayMs',
      'durationMs',
      'effects',
      'scaleX',
      'staggerMs',
      'style',
      'variant',
      'yPx',
      'index'
    ]) {
      expect(phoneCrossChunkContract.reservedPropertyNames).toContain(propertyName);
    }
  });

  it('keeps execution transport positional while presentation proofs stay structured', () => {
    expect(timelineDriverSource).toContain(
      'export type TimelineVideoFrameResult = readonly ['
    );
    expect(timelineDriverSource).not.toMatch(
      /export type TimelineVideoFrameResult\s*=\s*Readonly<\{[\s\S]*?\bstatus\s*:/
    );
    expect(source('phone-story/machine.ts')).toContain(
      'export type PhoneExecutionToken = readonly ['
    );
    expect(source('phone-story/machine.ts')).toContain(
      'export type PresentationToken = Readonly<{'
    );
    expect(source('phone-story/machine.ts')).not.toContain(
      'export type PhonePresentationToken = readonly ['
    );
    expect(source('phone-transition-coordinator.ts')).toContain(
      'export type PhoneIntent = readonly ['
    );
    expect(source('phone-transition-coordinator.ts')).toContain('return onIntent([');
    expect(source('phone-transition-coordinator.ts')).not.toContain('onIntent({');
    expect(source('phone-story/runtime.ts')).toContain(
      'export type PhoneCinematicSnapshot = readonly ['
    );
    expect(source('phone-story/runtime.ts')).toContain(
      'export type PhoneCompositeSession = readonly ['
    );
    expect(source('phone-story/runtime.ts')).toContain(
      'export type PhoneRuntimeScrollSample = readonly ['
    );
    expect(source('usePhoneDocumentScrollRuntime.ts')).toContain(
      'export type PhoneDocumentScrollSample = readonly ['
    );
    expect(source('phone-stage-timeline.ts')).toContain(
      'export type PhoneStageFrame = readonly ['
    );
    expect(source('phone-story/runtime.ts')).toContain(
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

  it('[R5] keeps direct-entry proof identity as an object until a renderer derives its local key', () => {
    const sharedPresentation = source('../../story/presentation.ts');
    expect(sharedPresentation).toContain('presentationToken: object;');
    expect(sharedPresentation).not.toContain('presentationToken: string;');

    for (const relative of [
      'PhoneGradeAStory.tsx',
      'PhoneBrandLabContinuation.tsx',
      'PhoneLabContactContinuation.tsx'
    ]) {
      const text = source(relative);
      expect(text).toContain('presentationToken: request.token');
      expect(text).not.toContain('phoneRuntimePresentationTokenKey(request.token)');
    }
    expect(source('phone-composite-runner.ts')).toContain(
      'presentationToken: presentationIdentity'
    );
    // Grade A forwards the raw leaf-admission token carried by its execution
    // tuple; it must not reconstruct a presentation identity at this boundary.
    expect(source('phone-grade-a-runtime.ts')).toContain(
      'presentationToken: execution[5]!'
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
