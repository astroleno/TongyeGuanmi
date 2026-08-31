import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PHONE_FINAL_EVIDENCE_KINDS,
  PHONE_PREPARED_EVIDENCE_KINDS,
  PHONE_TRANSACTION_MODES,
  type PhoneMediaFrameReceipt,
  type PhoneMediaFrameRequest
} from './protocol';

const source = readFileSync(new URL('./protocol.ts', import.meta.url), 'utf8');

describe('canonical phone protocol boundary', () => {
  it('exports only serializable transaction and evidence vocabulary', () => {
    expect(PHONE_TRANSACTION_MODES).toEqual([
      'boot',
      'entry',
      'segment',
      'rollback',
      'recovery'
    ]);
    expect(PHONE_PREPARED_EVIDENCE_KINDS).toEqual([
      'module-loaded',
      'root-connected',
      'image-decoded',
      'video-decoded',
      'canvas-drawn',
      'static-ready',
      'layout-measurable',
      'resource-budget-valid'
    ]);
    expect(PHONE_FINAL_EVIDENCE_KINDS).toEqual([
      'plane-acknowledged',
      'content-visible',
      'frame-visible',
      'coverage-visible',
      'landing-confirmed',
      'scroll-confirmed'
    ]);
    expect(() => JSON.stringify({
      modes: PHONE_TRANSACTION_MODES,
      prepared: PHONE_PREPARED_EVIDENCE_KINDS,
      final: PHONE_FINAL_EVIDENCE_KINDS
    })).not.toThrow();
  });

  it('has no DOM, React, browser, dynamic-import, or runtime dependency', () => {
    expect(source).not.toMatch(/\bfrom\s+['"]react['"]/);
    expect(source).not.toMatch(/\b(?:window|document|navigator|history|location)\b/);
    expect(source).not.toMatch(
      /\b(?:HTMLElement|HTMLCanvasElement|HTMLVideoElement|WebGLRenderingContext)\b/
    );
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/from\s+['"].*(?:runtime|presentation|scenes|transitions)/);
    expect(source).not.toMatch(/\b(?:let|var)\s+/);
  });

  it('keeps the phone frame receipt boundary serializable and abortable', () => {
    const controller = new AbortController();
    const request: PhoneMediaFrameRequest = {
      frameToken: 'tx:frame:1', transactionId: 'tx', direction: 1,
      sequence: 1, desiredProgress: .5, signal: controller.signal
    };
    const receipt: PhoneMediaFrameReceipt = {
      status: 'presented', frameToken: request.frameToken, sequence: request.sequence,
      desiredProgress: request.desiredProgress, presentedProgress: .5,
      evidence: 'packed-canvas-draw'
    };
    expect(controller.signal.aborted).toBe(false);
    expect(JSON.stringify({ request: { ...request, signal: undefined }, receipt })).toContain(
      'packed-canvas-draw'
    );
  });
});
