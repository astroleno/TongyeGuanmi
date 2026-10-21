// @vitest-environment jsdom
import { act, Suspense, useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { PhoneLeafGenerationBinding, PhoneLeafReportPort } from './presentation';
const probe = vi.hoisted(() => ({ reports: null as PhoneLeafReportPort | null, binding: null as PhoneLeafGenerationBinding | null }));
vi.mock('./scenes', () => ({ loadPhoneSceneModule: () => Promise.resolve({ default: PatternFixture }) }));
import { createPhoneScrollPlatform } from './scroll-platform';
import { createScrollSpine, locateScrollPosition, positionForScrollAnchor } from '../../story/scroll-spine';

function PatternFixture({ reports }: { reports: PhoneLeafReportPort }) {
  const root = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    probe.reports = reports;
    const image = root.current!.querySelector('img')!;
    Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 1 } });
    image.decode = async () => {};
    return reports.registerMount({ root: root.current!, surfaces: [{ id: 'pattern-image', kind: 'image', element: image }],
      commands: { rebind(binding) { probe.binding = binding; }, activate: () => ({ invocationId: '', invoked: false, surfaceIds: [], settlements: [] }),
        render() {}, settle() {}, pause() {}, dispose() {} } });
  }, [reports]);
  return <section ref={root}><img alt="" src="pattern.webp" /></section>;
}

it.each(['ready', 'aborted', 'failed'] as const)('requires current Pattern composite preparation rather than just its base image (%s)', async outcome => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div'); document.body.append(container);
  const platform = createPhoneScrollPlatform({ root: () => container, layer: () => container,
    requestRender() {}, requestWindow() {}, measure() {}, resourcesChanged() {} });
  const root = createRoot(container), Scene = platform.Scene, controller = new AbortController();
  let pending: Promise<unknown> | undefined;
  try {
    await act(async () => root.render(<Suspense><Scene scene="pattern" /></Suspense>));
    const index = createScrollSpine({ viewportHeight: 844, platform: 'phone' });
    const position = locateScrollPosition(index, positionForScrollAnchor(index, { rangeId: 'hold:pattern', progress: 0 }));
    let settled = false;
    pending = platform.adapter.prepare(position, { generation: 1, epoch: 1, revision: 1, layoutRevision: 1 }, controller.signal);
    void pending.then(() => { settled = true; }, () => undefined);
    await act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); });
    expect(settled).toBe(false);
    if (outcome === 'aborted') {
      controller.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    } else if (outcome === 'failed') {
      probe.reports!.reportFailure({ code: 'pattern-frame-rejected', message: 'texture decode failed', recoverable: true });
      await expect(pending).rejects.toThrow('texture decode failed');
    } else {
      probe.reports!.reportPrepared('pattern-image', { kind: 'image-decoded', ready: true, token: 'obsolete:prepared', detail: {} });
      await Promise.resolve(); expect(settled).toBe(false);
      probe.reports!.reportPrepared('pattern-image', { kind: 'image-decoded', ready: true, token: probe.binding!.frameToken + ':prepared', detail: {} });
      const window = await pending as { dispose(): void }; expect(settled).toBe(true); window.dispose();
    }
  } finally { controller.abort(); await pending?.catch(() => undefined); await act(async () => root.unmount()); platform.dispose(); container.remove(); vi.unstubAllGlobals(); }
});
