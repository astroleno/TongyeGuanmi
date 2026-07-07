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

  test('runs the full pilot chain with normal rhythm, real media milestones, copyCue, slow-ready, and reverse fallback', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r3-pilot');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await expect(page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(false);

    await page.evaluate(async () => {
      await window.__r3Pilot?.playForward();
      await window.__r3Pilot?.playForward({ slowReady: true });
    });

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

    const mediaReadyBeforeReverse = frame.mediaReadyAccepted;
    await page.evaluate(async () => {
      await window.__r3Pilot?.playReverse();
    });
    frame = await snapshot(page);
    expect(frame.window.current).toBe('aod-animation');
    expect(frame.mediaReadyAccepted).toBe(mediaReadyBeforeReverse);
    expect(frame.eventLog).toContain('MEDIA_READY:reverse-static-fallback');
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
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('star-map');

    const replay = page.evaluate(async () => {
      await window.__r3Pilot?.playForward();
    });

    await replay;
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
