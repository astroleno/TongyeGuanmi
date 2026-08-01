// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../production/phone-story/presentation';

const rendererProbe = vi.hoisted(() => ({
  render: vi.fn(), prewarm: vi.fn(), rebindGeneration: vi.fn(() => true),
  isActive: vi.fn(() => true), getFailure: vi.fn(() => null), destroy: vi.fn(),
  options: null as unknown
}));

vi.mock('./sceneInk', () => ({
  createInkFieldRenderer: vi.fn((_canvas, options) => {
    rendererProbe.options = options;
    return rendererProbe;
  })
}));

import { createPhoneInkLeaf } from './phoneInkLeaf';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function reportFixture() {
  let registration: PhoneLeafMountRegistration | null = null;
  const reports = {
    registerMount: vi.fn((next: PhoneLeafMountRegistration) => { registration = next; }),
    reportPrepared: vi.fn(), reportFrame: vi.fn(), reportProgress: vi.fn(),
    reportComplete: vi.fn(), reportFailure: vi.fn()
  } satisfies PhoneLeafReportPort;
  return { reports, registration: () => registration };
}

describe('clean phone Ink leaf', () => {
  it('registers one exact WebGL effect surface and exposes only six commands', async () => {
    const Leaf = createPhoneInkLeaf({
      segmentId: 'hero-pattern', surfaceId: 'fx:hero-pattern',
      field: { kind: 'radial', origin: { x: .5, y: .44 }, seed: 'hero' },
      grade: 'dark', canvasClassName: 'portrait-scroll-spike__ink'
    });
    const host = document.createElement('div');
    document.body.replaceChildren(host);
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<Leaf reports={mount.reports} />); });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['fx:hero-pattern', 'canvas-webgl']
    ]);
    expect(Object.keys(mount.registration()?.commands ?? {}).sort()).toEqual([
      'activate', 'dispose', 'pause', 'rebind', 'render', 'settle'
    ]);
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports, frameToken: 'ink:frame:1'
    });
    mount.registration()?.commands.render(.5);
    expect(rendererProbe.rebindGeneration).toHaveBeenCalledWith('ink:frame:1');
    expect(rendererProbe.render).toHaveBeenCalledWith(expect.objectContaining({
      progress: .5,
      spec: expect.objectContaining({ kind: 'radial', seed: 'hero' })
    }));
    const canvas = host.querySelector('canvas')!;
    expect(canvas.style.visibility).toBe('visible');
    expect(canvas.style.opacity).toBe('1');
    mount.registration()?.commands.settle(1);
    expect(canvas.style.visibility).toBe('hidden');
    expect(canvas.style.opacity).toBe('0');
    expect(rendererProbe.options).toMatchObject({
      removeCanvasOnDestroy: false, loseContextOnDestroy: false,
      fieldKind: 'radial', grade: 'dark'
    });
  });

  it('fails closed when the current renderer invalidates', async () => {
    const Leaf = createPhoneInkLeaf({
      segmentId: 'star-map-aod', surfaceId: 'fx:star-map-aod',
      field: { kind: 'horizontal', direction: 'bottom-to-top', seed: 'star' },
      grade: 'edge-bright'
    });
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<Leaf reports={mount.reports} />); });
    const current = reportFixture();
    mount.registration()?.commands.rebind({ reports: current.reports, frameToken: 'ink:2' });
    const invalidated = (rendererProbe.options as {
      onInvalidated(failure: { generation: string; reason: string }): void;
    }).onInvalidated;
    invalidated({ generation: 'ink:2', reason: 'context-lost' });
    expect(current.reports.reportFailure).toHaveBeenCalledWith({
      code: 'star-map-aod-ink-context-lost',
      message: 'Star-map-aod Ink renderer context-lost', recoverable: true,
      detail: { generation: 'ink:2' }
    });
  });
});
