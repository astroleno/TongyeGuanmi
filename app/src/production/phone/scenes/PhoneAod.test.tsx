import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  PhoneAod,
  phoneAodPresentationFrame
} from './PhoneAod';

const aodSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'PhoneAod.tsx'),
  'utf8'
);

describe('PhoneAod Route B adapter', () => {
  it('keeps its stable root mounted and reserves active for decoder resources', () => {
    const markup = renderToStaticMarkup(
      <PhoneAod active={false} reducedMotion={false} />
    );

    expect(markup).toContain(
      'class="portrait-scroll-spike__scene portrait-scroll-spike__scene--aod"'
    );
    expect(markup).toContain('data-aod-figure-canvas="true"');
    expect(markup).toContain('data-aod-figure-video="true"');
  });

  it('returns the original immutable token only as a static leaf frame', () => {
    const token = {
      authorityId: 'aod-authority',
      sessionId: 'aod-session',
      generation: 4,
      leg: 0,
      revision: 9,
      subject: 'front:aod',
      kind: 'static-poster' as const
    };

    expect(phoneAodPresentationFrame(token, 1, 48)).toEqual({
      token,
      frameSequence: 1,
      observedAt: 48,
      origin: 'leaf-static-poster'
    });
  });

  it('[Star→AOD hard cutover] keeps the immutable token shape used by the canvas proof', () => {
    const token = {
      authorityId: 'aod-authority',
      sessionId: 'aod-session',
      generation: 4,
      leg: 0,
      revision: 9,
      subject: 'front:aod',
      kind: 'static-poster' as const
    };

    expect(phoneAodPresentationFrame(token, 1, 48, 'leaf-post-paint')).toEqual({
      token,
      frameSequence: 1,
      observedAt: 48,
      origin: 'leaf-post-paint'
    });
  });

  it('keeps a synchronously restored compositor for the pending presentation lease', () => {
    const ensureCompositor = aodSource.slice(
      aodSource.indexOf('const ensureCompositor'),
      aodSource.indexOf('progressListenerRef.current')
    );
    expect(ensureCompositor).toContain('return compositorRef.current;');
    const presentationPath = aodSource.slice(
      aodSource.indexOf('presentPresentation(token'),
      aodSource.indexOf('disposePresentation(token')
    );
    expect(presentationPath).toContain(
      'ensureCompositor() ?? compositorRef.current'
    );
  });

});
