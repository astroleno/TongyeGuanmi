// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../production/phone-story/presentation';

const rendererProbe = vi.hoisted(() => ({
  render: vi.fn(), prewarm: vi.fn(), rebindGeneration: vi.fn(() => true),
  isActive: vi.fn(() => true), getFailure: vi.fn(() => null), destroy: vi.fn(),
  options: null as unknown
}));
const depthMaskProbe = vi.hoisted(() => ({
  committed: false,
  ready: Promise.resolve() as Promise<void>,
  render: vi.fn(),
  dispose: vi.fn()
}));

vi.mock('./sceneInk', () => ({
  createInkFieldRenderer: vi.fn((_canvas, options) => {
    rendererProbe.options = options;
    return rendererProbe;
  })
}));

vi.mock('./depthThresholdMask', () => ({
  createDepthThresholdMask: vi.fn(() => {
    depthMaskProbe.committed = false;
    return {
      maskIds: { reveal: 'depth-reveal', conceal: 'depth-conceal' },
      ready: depthMaskProbe.ready,
      commit: vi.fn(() => { depthMaskProbe.committed = true; }),
      committed: () => depthMaskProbe.committed,
      render: depthMaskProbe.render,
      dispose: depthMaskProbe.dispose
    };
  })
}));

import { createPhoneInkLeaf } from './phoneInkLeaf';
import { createDepthThresholdMask } from './depthThresholdMask';

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
  beforeEach(() => {
    depthMaskProbe.committed = false;
    depthMaskProbe.ready = Promise.resolve();
    depthMaskProbe.render.mockClear();
    depthMaskProbe.dispose.mockClear();
    vi.mocked(createDepthThresholdMask).mockClear();
    rendererProbe.render.mockReset();
    rendererProbe.prewarm.mockClear();
    rendererProbe.rebindGeneration.mockClear();
    rendererProbe.rebindGeneration.mockReturnValue(true);
  });

  it('attaches complementary masks to the fixed source and receiver planes', async () => {
    depthMaskProbe.committed = false;
    const Leaf = createPhoneInkLeaf({
      segmentId: 'figure2-distance-expand',
      surfaceId: 'fx:figure2-distance-expand',
      field: {
        kind: 'depth', depthSrc: '/figure2-depth.webp', seed: 'figure2',
        transform: {
          viewport: { width: 390, height: 844 },
          cover: { x: -555, y: 0, width: 1500, height: 844 },
          camera: { scale: 1.142, translateX: 0, translateY: -34, originX: .5, originY: .56 }
        }
      },
      depthMaskAtlasSrc: '/figure2-depth-mask-atlas.webp',
      grade: 'edge-only'
    });
    const planes = document.createElement('div');
    planes.className = 'phone-story__planes';
    const effect = document.createElement('div');
    effect.dataset.phonePlane = 'effect';
    const source = document.createElement('div');
    source.dataset.phonePlane = 'source';
    const figure2 = document.createElement('article');
    figure2.dataset.r4Scene = 'figure2-animation';
    source.append(figure2);
    const receiver = document.createElement('div');
    receiver.dataset.phonePlane = 'receiver';
    const proof = document.createElement('article');
    proof.dataset.r4ProofCompound = 'true';
    receiver.append(proof);
    const host = document.createElement('div');
    effect.append(host);
    planes.append(source, receiver, effect);
    document.body.replaceChildren(planes);
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => {
      root.render(<Leaf reports={mount.reports} />);
      await Promise.resolve();
    });
    const current = reportFixture();
    await act(async () => {
      mount.registration()?.commands.rebind({
        reports: current.reports, frameToken: 'depth:frame:1', transactionId: 'depth'
      });
      await Promise.resolve();
    });
    const projected = mount.registration()?.commands.render(.5);

    expect(projected?.ownership).not.toHaveProperty('revealMask');
    expect(projected?.ownership).not.toHaveProperty('concealMask');
    expect(depthMaskProbe.render).toHaveBeenCalledWith(.5, expect.anything());
    expect((await import('./depthThresholdMask')).createDepthThresholdMask)
      .toHaveBeenCalledWith(expect.objectContaining({
        host: planes,
        targets: [
          { element: source, polarity: 'conceal' },
          { element: receiver, polarity: 'reveal' }
        ],
        polarities: ['reveal', 'conceal'],
        runId: 'depth'
      }));
    expect(current.reports.reportPrepared).toHaveBeenCalledWith(
      'fx:figure2-distance-expand',
      expect.objectContaining({ kind: 'image-decoded', ready: true })
    );
  });

  it('keeps semantic reveal and conceal polarity when the fixed planes reverse roles', async () => {
    const Leaf = createPhoneInkLeaf({
      segmentId: 'figure2-distance-expand',
      surfaceId: 'fx:figure2-distance-expand',
      field: {
        kind: 'depth', depthSrc: '/figure2-depth.webp', seed: 'figure2',
        transform: {
          viewport: { width: 390, height: 844 },
          cover: { x: -555, y: 0, width: 1500, height: 844 },
          camera: { scale: 1.142, translateX: 0, translateY: -34, originX: .5, originY: .56 }
        }
      },
      depthMaskAtlasSrc: '/figure2-depth-mask-atlas.webp', grade: 'edge-only'
    });
    const planes = document.createElement('div');
    planes.className = 'phone-story__planes';
    const source = document.createElement('div');
    source.dataset.phonePlane = 'source';
    const proof = document.createElement('article');
    proof.dataset.r4ProofCompound = 'true';
    source.append(proof);
    const receiver = document.createElement('div');
    receiver.dataset.phonePlane = 'receiver';
    const figure2 = document.createElement('article');
    figure2.dataset.r4Scene = 'figure2-animation';
    receiver.append(figure2);
    const effect = document.createElement('div');
    effect.dataset.phonePlane = 'effect';
    const host = document.createElement('div');
    effect.append(host);
    planes.append(source, receiver, effect);
    document.body.replaceChildren(planes);
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<Leaf reports={mount.reports} />); });
    const current = reportFixture();
    await act(async () => {
      mount.registration()?.commands.rebind({
        reports: current.reports, frameToken: 'depth:reverse:1',
        transactionId: 'depth:reverse', direction: 'reverse'
      });
      await Promise.resolve();
    });

    expect(createDepthThresholdMask).toHaveBeenCalledWith(expect.objectContaining({
      targets: [
        { element: receiver, polarity: 'conceal' },
        { element: source, polarity: 'reveal' }
      ]
    }));
    act(() => root.unmount());
  });

  it('retains one committed depth mask while the same transaction changes stage', async () => {
    const Leaf = createPhoneInkLeaf({
      segmentId: 'figure2-distance-expand',
      surfaceId: 'fx:figure2-distance-expand',
      field: {
        kind: 'depth', depthSrc: '/figure2-depth.webp', seed: 'figure2',
        transform: {
          viewport: { width: 390, height: 844 },
          cover: { x: -555, y: 0, width: 1500, height: 844 },
          camera: { scale: 1.142, translateX: 0, translateY: -34, originX: .5, originY: .56 }
        }
      },
      depthMaskAtlasSrc: '/figure2-depth-mask-atlas.webp', grade: 'edge-only'
    });
    const host = document.createElement('div');
    document.body.replaceChildren(host);
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<Leaf reports={mount.reports} />); });
    const stage0 = reportFixture();
    await act(async () => {
      mount.registration()?.commands.rebind({
        reports: stage0.reports,
        frameToken: 'phone:1:segment:figure2:frame:1', transactionId: 'phone:1:segment:figure2', stageIndex: 0
      });
      await Promise.resolve();
    });
    const createMask = vi.mocked(createDepthThresholdMask);
    expect(createMask).toHaveBeenCalledTimes(1);
    expect(mount.registration()?.commands.render(.45)?.ownership)
      .not.toHaveProperty('concealMask');

    depthMaskProbe.ready = new Promise(() => undefined);
    const stage1 = reportFixture();
    mount.registration()?.commands.rebind({
      reports: stage1.reports,
      frameToken: 'phone:1:segment:figure2:frame:2', transactionId: 'phone:1:segment:figure2', stageIndex: 1
    });

    expect(createMask).toHaveBeenCalledTimes(1);
    expect(depthMaskProbe.dispose).not.toHaveBeenCalled();
    expect(mount.registration()?.commands.render(.5)?.ownership)
      .not.toHaveProperty('concealMask');
    expect(stage1.reports.reportPrepared).toHaveBeenCalledWith(
      'fx:figure2-distance-expand', expect.objectContaining({ kind: 'image-decoded' })
    );
  });

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
    const canvas = host.querySelector('canvas')!;
    rendererProbe.render.mockImplementationOnce(() => {
      expect(canvas.style.visibility).toBe('hidden');
      expect(canvas.style.opacity).toBe('0');
    });
    const projected = mount.registration()?.commands.render(.5);
    expect(rendererProbe.rebindGeneration).toHaveBeenCalledWith('ink:frame:1');
    expect(rendererProbe.render).toHaveBeenCalledWith(expect.objectContaining({
      progress: .5,
      spec: expect.objectContaining({ kind: 'radial', seed: 'hero' })
    }));
    expect(projected).toEqual({
      ownership: expect.objectContaining({
        revealClip: expect.stringMatching(/^circle\(/),
        concealMask: expect.stringMatching(/^radial-gradient\(/)
      })
    });
    expect(canvas.style.visibility).toBe('visible');
    expect(canvas.style.opacity).toBe('1');
    expect(canvas.dataset.r4InkBoundaryProgress).toBe('0.5000');
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
