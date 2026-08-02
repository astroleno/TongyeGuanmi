import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { hashForScene, sceneFromHash } from '../../../production/navigation';
import type { PhoneLeafReportPort } from '../../../production/phone-story/presentation';
import {
  PHONE_CONTACT_INPUT_POLICY,
  PhoneContact
} from './PhoneContact';

const source = readFileSync(new URL('./PhoneContact.tsx', import.meta.url), 'utf8');
const stylesheet = readFileSync(new URL('./PhoneContact.css', import.meta.url), 'utf8');
const reports = {
  registerMount() {}, reportPrepared() {}, reportFrame() {}, reportProgress() {},
  reportComplete() {}, reportFailure() {}
} satisfies PhoneLeafReportPort;

describe('PhoneContact', () => {
  it('keeps one canonical terminal article with keyboard-reachable actions', () => {
    const markup = renderToStaticMarkup(createElement(PhoneContact, {
      reports
    }));

    expect(markup).toContain('id="contact"');
    expect(markup.match(/data-r4-scene="contact"/g)).toHaveLength(1);
    expect(markup).toContain('约一次 AI 现场诊断');
    expect(markup).toContain('href="mailto:contact@example.com');
    expect(markup).toContain('href="#top"');
    expect(markup).toContain('data-phone-contact-state="terminal"');
    expect(markup).not.toContain('tabindex="-1"');
  });

  it('declares all CTA interaction paths as native pass-through', () => {
    expect(PHONE_CONTACT_INPUT_POLICY).toEqual({
      wheel: 'native',
      touch: 'native',
      keyboard: 'native',
      focus: 'native',
      pointer: 'native'
    });
    expect(source).not.toMatch(/addEventListener\(/);
    expect(source).not.toContain(['production', 'phone', 'types'].join('/'));
    expect(stylesheet).toMatch(
      /\.phone-contact\s*>\s*\.r4-contact\s*\{[^}]*min-height:\s*var\(--phone-cinematic-stage-height,\s*100lvh\)/s
    );
  });

  it('uses the shared Contact hash without importing prior visual scenes', () => {
    expect(hashForScene('contact')).toBe('#contact');
    expect(sceneFromHash('#contact')).toBe('contact');
    expect(source).not.toMatch(/ph-animation|crane-animation|prepare(?:Ph|Crane)/);
  });
});
