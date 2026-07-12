import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type PilotSnapshot = {
  phase: 'hold' | 'preparing' | 'playing' | 'recovering';
  mode: string;
  window: { current: string; retiring: readonly string[] };
  visibleCount: number;
  interactableCount: number;
  mountedCount: number;
  eventLog: readonly string[];
  mediaReadyAccepted: number;
  loadedmetadataAccepted: number;
  canplayAccepted: number;
  endedAccepted: number;
  duplicateMediaReadyIgnored: number;
  staleMediaEventIgnored: number;
  mediaTimeouts: number;
  recoveryCount: number;
  copyCueActivations: number;
  inkGrade: 'edge-only' | 'dark';
  mediaMilestones: readonly {
    milestone?: string;
    accepted?: boolean;
    reason?: string;
    prepareToken?: string;
    runId?: string;
  }[];
  trace: readonly unknown[];
};

type TraceEvent = {
  type?: string;
  scene?: string;
  runId?: string;
};

type TraceRecord = {
  at?: number;
  event?: TraceEvent;
};

declare global {
  interface Window {
    __r3Pilot?: {
      playForward(options?: { slowReady?: boolean; buildTimeout?: boolean; offline?: boolean }): Promise<void>;
      playReverse(options?: { slowReady?: boolean; buildTimeout?: boolean; offline?: boolean }): Promise<void>;
      seek(scene: 'star-map' | 'aod-animation' | 'method-top'): void;
      duplicateMediaReady(): void;
      staleMediaReady(): void;
      probeVideoMilestones(): Promise<void>;
      copyCueCycle(): Promise<void>;
      setInkGrade(grade: 'edge-only' | 'dark'): void;
      snapshot(): PilotSnapshot;
    };
  }
}

async function snapshot(page: Page): Promise<PilotSnapshot> {
  return page.evaluate(() => {
    const api = window.__r3Pilot;
    if (!api) {
      throw new Error('R3 pilot harness API is not installed');
    }
    return api.snapshot();
  });
}

function tracePayload(frame: PilotSnapshot) {
  const trace = frame.trace.map((record) => {
    const item = record as {
      id?: number;
      at?: number;
      event?: unknown;
      actorEpoch?: string;
      activeRunId?: unknown;
      prepareToken?: unknown;
      queuedIntent?: unknown;
      pausePoint?: unknown;
      cursor?: unknown;
      layerWindow?: unknown;
      milestone?: unknown;
    };
    return {
      id: item.id ?? null,
      at: item.at ?? null,
      event: item.event ?? null,
      actorEpoch: item.actorEpoch ?? null,
      activeRunId: item.activeRunId ?? null,
      prepareToken: item.prepareToken ?? null,
      queuedIntent: item.queuedIntent ?? null,
      pausePoint: item.pausePoint ?? null,
      cursor: item.cursor ?? null,
      layerWindow: item.layerWindow ?? null,
      milestone: item.milestone ?? null
    };
  });
  return {
    generatedBy: 'app/e2e/r3-pilot.spec.ts',
    mode: frame.mode,
    phase: frame.phase,
    window: frame.window,
    eventLog: frame.eventLog,
    mediaMilestones: frame.mediaMilestones,
    trace
  };
}

function writeTrace(name: string, frame: PilotSnapshot): void {
  const artifactDir = resolve(process.cwd(), '..', 'artifacts', 'react-refactor', 'r3-pilot');
  mkdirSync(artifactDir, { recursive: true });
  const payload = `${JSON.stringify(tracePayload(frame), null, 2)}\n`;
  writeFileSync(resolve(artifactDir, name), payload);
  if (name === 'pilot-success-trace.json') {
    writeFileSync(resolve(artifactDir, 'pilot-devtools-trace.json'), payload);
  }
}

function traceEventAt(frame: PilotSnapshot, type: string, predicate: (event: TraceEvent) => boolean): number {
  const record = frame.trace.find((item): item is TraceRecord => {
    const event = (item as TraceRecord).event;
    return event?.type === type && predicate(event);
  });
  if (typeof record?.at !== 'number') {
    throw new Error(`Missing trace event ${type}`);
  }
  return record.at;
}

test.describe('R3 pilot harness', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });

  test('alternates Star Map and AOD ten times with a fresh live ink run', async ({ page }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r3-pilot');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    expect((await snapshot(page)).inkGrade).toBe('edge-only');
    const generations = new Set<string>();

    for (let index = 0; index < 10; index += 1) {
      const direction = index % 2 === 0 ? 1 : -1;
      const expectedScene = direction === 1 ? 'aod-animation' : 'star-map';
      await page.evaluate((runDirection) => {
        if (runDirection === 1) {
          void window.__r3Pilot?.playForward();
        } else {
          void window.__r3Pilot?.playReverse();
        }
      }, direction);

      let observed: {
        count: number;
        generation: string;
        rendererActive: boolean;
        bodyVisible: boolean;
        parentIsStage: boolean;
      } | undefined;
      await expect.poll(async () => {
        const next = await page.evaluate(() => {
          const canvases = [...document.querySelectorAll<HTMLCanvasElement>(
            '.stage > canvas[data-r4-ink-segment="star-map-aod"]'
          )];
          const canvas = canvases[0];
          return {
            count: canvases.length,
            generation: canvas?.dataset.r4InkGeneration ?? '',
            rendererActive: canvas?.dataset.r4InkRendererActive === 'true',
            bodyVisible: canvas?.dataset.r4InkBodyVisible === 'true',
            parentIsStage: canvas?.parentElement?.classList.contains('stage') === true
          };
        });
        if (
          next.count === 1
          && next.generation.length > 0
          && next.rendererActive
          && next.bodyVisible
          && next.parentIsStage
        ) {
          observed = next;
          return true;
        }
        return false;
      }, { timeout: 15_000 }).toBe(true);

      expect(observed).toBeDefined();
      generations.add(observed?.generation ?? '');
      await expect.poll(async () => {
        const frame = await snapshot(page);
        return frame.phase === 'hold' && frame.window.current === expectedScene;
      }, { timeout: 15_000 }).toBe(true);
      await expect.poll(() => page.locator(
        '.stage > canvas[data-r4-ink-segment="star-map-aod"]'
      ).count()).toBe(0);
    }

    expect(generations.size).toBe(10);
  });

  test('composites Method beneath authored AOD alpha in both directions', async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/aod-method-top');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    const captureAlphaInterval = async (direction: 1 | -1) => page.evaluate((playDirection) => new Promise<{
        progress: number;
        aodLayerOpacity: string;
        methodLayerOpacity: string;
        copyCueActive: string;
        methodCopyVisibility: string;
        alphaComposite: string;
        rootBackgroundColor: string;
        stickyBackgroundColor: string;
        fieldBackgroundColor: string;
        revealBackgroundColor: string;
        paperSolidOpacity: string;
        figureOpacity: string;
      } | null>((resolve) => {
        let animationFrame = 0;
        const timeout = window.setTimeout(() => {
          cancelAnimationFrame(animationFrame);
          resolve(null);
        }, 15_000);
        const sample = () => {
          const aodLayer = document.querySelector<HTMLElement>('[data-stage-layer="aod-animation"]');
          const methodLayer = document.querySelector<HTMLElement>('[data-stage-layer="method-top"]');
          const root = aodLayer?.querySelector<HTMLElement>('[data-aod-transition]');
          const sticky = root?.querySelector<HTMLElement>('.aod-transition__sticky');
          const field = root?.querySelector<HTMLElement>('.aod-transition__field');
          const reveal = root?.querySelector<HTMLElement>('.aod-transition__reveal-surface');
          const paperSolid = root?.querySelector<HTMLElement>('.aod-transition__paper-solid');
          const figure = root?.querySelector<HTMLElement>('[data-aod-figure-video]');
          const methodCopy = methodLayer?.querySelector<HTMLElement>('.r4-method__layout');
          const next = {
            progress: Number.parseFloat(methodLayer?.dataset.aodMethodTransitionProgress ?? '-1'),
            aodLayerOpacity: aodLayer ? getComputedStyle(aodLayer).opacity : '',
            methodLayerOpacity: methodLayer ? getComputedStyle(methodLayer).opacity : '',
            copyCueActive: methodLayer?.dataset.copyCueActive ?? '',
            methodCopyVisibility: methodCopy ? getComputedStyle(methodCopy).visibility : '',
            alphaComposite: root?.dataset.aodAlphaComposite ?? '',
            rootBackgroundColor: root ? getComputedStyle(root).backgroundColor : '',
            stickyBackgroundColor: sticky ? getComputedStyle(sticky).backgroundColor : '',
            fieldBackgroundColor: field ? getComputedStyle(field).backgroundColor : '',
            revealBackgroundColor: reveal ? getComputedStyle(reveal).backgroundColor : '',
            paperSolidOpacity: paperSolid ? getComputedStyle(paperSolid).opacity : '',
            figureOpacity: figure ? getComputedStyle(figure).opacity : ''
          };
          if (next.progress >= 0.18 && next.progress <= 0.3) {
            window.clearTimeout(timeout);
            resolve(next);
            return;
          }
          animationFrame = requestAnimationFrame(sample);
        };
        animationFrame = requestAnimationFrame(sample);
        if (playDirection === 1) {
          void window.__r3Pilot?.playForward();
        } else {
          void window.__r3Pilot?.playReverse();
        }
      }), direction);

    const forward = await captureAlphaInterval(1);
    expect(forward).not.toBeNull();
    expect(forward).toMatchObject({
      aodLayerOpacity: '1',
      methodLayerOpacity: '1',
      copyCueActive: 'false',
      methodCopyVisibility: 'hidden',
      alphaComposite: 'true',
      rootBackgroundColor: 'rgba(0, 0, 0, 0)',
      stickyBackgroundColor: 'rgba(0, 0, 0, 0)',
      fieldBackgroundColor: 'rgba(0, 0, 0, 0)',
      revealBackgroundColor: 'rgba(0, 0, 0, 0)',
      paperSolidOpacity: '0',
      figureOpacity: '1'
    });
    await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 15_000 })
      .toBe('method-top');

    const reverse = await captureAlphaInterval(-1);
    expect(reverse).not.toBeNull();
    expect(reverse).toMatchObject({
      aodLayerOpacity: forward?.aodLayerOpacity,
      methodLayerOpacity: forward?.methodLayerOpacity,
      copyCueActive: 'false',
      methodCopyVisibility: 'hidden',
      alphaComposite: 'true',
      rootBackgroundColor: forward?.rootBackgroundColor,
      stickyBackgroundColor: forward?.stickyBackgroundColor,
      fieldBackgroundColor: forward?.fieldBackgroundColor,
      revealBackgroundColor: forward?.revealBackgroundColor,
      paperSolidOpacity: '0',
      figureOpacity: '1'
    });
    await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 15_000 })
      .toBe('aod-animation');
  });

  test('runs the full pilot chain with normal rhythm, real media milestones, copyCue, slow-ready, and required reverse readiness', async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r3-pilot');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await expect(page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(false);

    await page.evaluate(() => {
      void window.__r3Pilot?.playForward();
    });
    await expect.poll(async () => {
      const frame = await snapshot(page);
      return frame.phase === 'hold' && frame.window.current === 'aod-animation';
    }, { timeout: 15_000 }).toBe(true);
    await page.evaluate(() => {
      void window.__r3Pilot?.playForward({ slowReady: true });
    });
    await expect.poll(async () => {
      const frame = await snapshot(page);
      return frame.phase === 'hold' && frame.window.current === 'method-top';
    }, { timeout: 15_000 }).toBe(true);

    let frame = await snapshot(page);
    writeTrace('pilot-success-trace.json', frame);

    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('method-top');
    expect(frame.mediaReadyAccepted).toBeGreaterThanOrEqual(1);
    expect(frame.loadedmetadataAccepted).toBeGreaterThanOrEqual(1);
    expect(frame.canplayAccepted).toBeGreaterThanOrEqual(1);
    expect(frame.endedAccepted).toBe(0);
    expect(frame.copyCueActivations).toBe(1);
    expect(frame.eventLog).toContain('MEDIA_READY:accepted');
    expect(frame.mediaMilestones.some((record) => record.milestone === 'ended')).toBe(false);
    expect(
      traceEventAt(frame, 'PLAYBACK_DONE', (event) => event.runId === 'r3-pilot:1') -
      traceEventAt(frame, 'TARGET_READY', (event) => event.scene === 'aod-animation')
    ).toBeGreaterThan(500);
    expect(frame.eventLog).toContain('PLAY:aod-method-top:1');

    await page.evaluate(() => {
      const scrollport = document.querySelector<HTMLElement>('[data-r4-scene="method-top"] [data-reading-scrollport="true"]');
      scrollport?.scrollTo({ top: scrollport.scrollHeight, behavior: 'instant' });
    });
    await expect.poll(async () => page.evaluate(() => {
      const scrollport = document.querySelector<HTMLElement>('[data-reading-scrollport="true"]');
      return (scrollport?.scrollTop ?? 0) + (scrollport?.clientHeight ?? 0) >= (scrollport?.scrollHeight ?? 0) - 1;
    })).toBe(true);

    const mediaReadyBeforeReverse = frame.mediaReadyAccepted;
    const metadataBeforeReverse = frame.loadedmetadataAccepted;
    const canPlayBeforeReverse = frame.canplayAccepted;
    await page.evaluate(() => {
      void window.__r3Pilot?.playReverse();
    });
    await expect.poll(async () => {
      const frame = await snapshot(page);
      return frame.phase === 'hold' && frame.window.current === 'aod-animation';
    }, { timeout: 15_000 }).toBe(true);
    frame = await snapshot(page);
    expect(frame.window.current).toBe('aod-animation');
    expect(frame.mediaReadyAccepted).toBe(mediaReadyBeforeReverse + 1);
    expect(frame.loadedmetadataAccepted).toBe(metadataBeforeReverse + 1);
    expect(frame.canplayAccepted).toBe(canPlayBeforeReverse + 1);
    expect(frame.eventLog).not.toContain('MEDIA_READY:reverse-static-fallback');

    await page.evaluate(() => {
      void window.__r3Pilot?.playForward();
    });
    await expect.poll(async () => {
      const next = await snapshot(page);
      return next.phase === 'hold' && next.window.current === 'method-top';
    }, { timeout: 15_000 }).toBe(true);
    await expect.poll(async () => page.evaluate(() => {
      const scrollport = document.querySelector<HTMLElement>('[data-r4-scene="method-top"] [data-reading-scrollport="true"]');
      return {
        edge: scrollport?.dataset.readingEdge,
        top: scrollport?.scrollTop
      };
    })).toEqual({ edge: 'top', top: 0 });
  });

  test('covers the reduced-motion pilot branch separately from the normal rhythm trace', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness/r3-pilot');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await expect(page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(true);

    await page.evaluate(async () => {
      await window.__r3Pilot?.playForward();
      await window.__r3Pilot?.playForward();
    });

    const frame = await snapshot(page);
    writeTrace('pilot-reduced-motion-trace.json', frame);

    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('method-top');
    expect(frame.copyCueActivations).toBe(1);
    expect(
      traceEventAt(frame, 'PLAYBACK_DONE', (event) => event.runId === 'r3-pilot:1') -
      traceEventAt(frame, 'TARGET_READY', (event) => event.scene === 'aod-animation')
    ).toBeLessThanOrEqual(50);
    expect(
      traceEventAt(frame, 'PLAYBACK_DONE', (event) => event.runId === 'r3-pilot:2') -
      traceEventAt(frame, 'TARGET_READY', (event) => event.scene === 'method-top')
    ).toBeLessThanOrEqual(50);
  });

  test('replays a cached segment from progress 0 after direct seek back to the start', async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r3-pilot');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(async () => {
      await window.__r3Pilot?.playForward();
    });
    let frame = await snapshot(page);
    expect(frame.window.current).toBe('aod-animation');

    await page.evaluate(() => {
      window.__r3Pilot?.seek('star-map');
    });
    await expect.poll(async () => {
      const frame = await snapshot(page);
      return frame.phase === 'hold' && frame.window.current === 'star-map';
    }, { timeout: 15_000 }).toBe(true);

    await page.evaluate(() => {
      void window.__r3Pilot?.playForward();
    });

    await expect.poll(async () => {
      const frame = await snapshot(page);
      return frame.phase === 'hold' && frame.window.current === 'aod-animation';
    }, { timeout: 15_000 }).toBe(true);
    frame = await snapshot(page);
    expect(frame.window.current).toBe('aod-animation');
  });

  test('records raw AOD video metadata, canplay, and ended milestones without reusing pilot run ids', async ({ page }) => {
    await page.goto('/harness/aod-animation');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(async () => {
      await window.__r3Pilot?.probeVideoMilestones();
    });

    const frame = await snapshot(page);
    writeTrace('pilot-media-milestones-trace.json', frame);

    expect(frame.loadedmetadataAccepted).toBeGreaterThanOrEqual(1);
    expect(frame.canplayAccepted).toBeGreaterThanOrEqual(1);
    expect(frame.endedAccepted).toBe(1);
    expect(frame.mediaMilestones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ milestone: 'loadedmetadata', accepted: true, prepareToken: expect.stringMatching(/^r3-probe:prepare:\d+$/) }),
        expect.objectContaining({ milestone: 'canplay', accepted: true, prepareToken: expect.stringMatching(/^r3-probe:prepare:\d+$/) }),
        expect.objectContaining({ milestone: 'ended', accepted: true, runId: expect.stringMatching(/^r3-probe:\d+$/) })
      ])
    );
    expect(frame.mediaMilestones.some((record) => record.runId === 'r3-pilot:1')).toBe(false);
  });

  test('records duplicate/stale media events and recovery trace without locking input', async ({ page }) => {
    await page.goto('/harness/aod-method-top');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(() => {
      window.__r3Pilot?.duplicateMediaReady();
      window.__r3Pilot?.staleMediaReady();
    });
    await page.evaluate(async () => {
      await window.__r3Pilot?.playForward({ offline: true });
    });

    const frame = await snapshot(page);
    writeTrace('pilot-recovery-trace.json', frame);

    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('method-top');
    expect(frame.interactableCount).toBe(1);
    expect(frame.recoveryCount).toBe(1);
    expect(frame.duplicateMediaReadyIgnored).toBe(1);
    expect(frame.staleMediaEventIgnored).toBeGreaterThanOrEqual(1);
    expect(frame.eventLog).toContain('PREPARE_TIMEOUT');
    expect(frame.mediaMilestones.length).toBeGreaterThan(0);
    expect(frame.trace.length).toBeGreaterThan(0);
  });
});
