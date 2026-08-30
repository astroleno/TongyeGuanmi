import { expect, test, type Page } from '@playwright/test';

type FrameLockRow = Readonly<{
  status: 'presented' | 'stale';
  sequence: number;
  desiredFrameIndex: number;
  presentedFrameIndex: number;
  frameLag: number;
  evidence: string;
  committed: boolean;
}>;

type FrameLockSnapshot = Readonly<{
  surface: string;
  status: string;
  errorCode: string | null;
  rows: readonly FrameLockRow[];
  presentedFrameIndex: number;
  staleCount: number;
  craneChildFrameLags: readonly number[];
  webglContextsReleased: boolean;
}>;

declare global {
  interface Window {
    __frameLockSpike?: {
      runSequence(mode?: 'forward' | 'reverse' | 'endpoints' | 'random' | 'pressure'): Promise<readonly FrameLockRow[]>;
      runLatestWins(oldFrameIndex?: number, latestFrameIndex?: number): Promise<readonly FrameLockRow[]>;
      snapshot(): FrameLockSnapshot;
    };
  }
}

async function snapshot(page: Page): Promise<FrameLockSnapshot> {
  return page.evaluate(() => {
    const api = window.__frameLockSpike;
    if (!api) throw new Error('frame-lock spike API is not installed');
    return api.snapshot();
  });
}

async function waitForSpike(page: Page, minimumRows = 7): Promise<FrameLockSnapshot> {
  await expect.poll(async () => (
    await page.locator('[data-frame-lock-status]').getAttribute('data-frame-lock-status')
  ), { timeout: 30_000 }).toMatch(/^(ready|static-fallback|error)$/);
  const currentStatus = await page.locator('[data-frame-lock-status]').getAttribute('data-frame-lock-status');
  if (currentStatus !== 'ready') return snapshot(page);
  await expect.poll(async () => (await snapshot(page)).rows.length, {
    timeout: 35_000,
    message: 'PH deterministic sequence produced receipt rows'
  }).toBeGreaterThanOrEqual(minimumRows);
  return snapshot(page);
}

function assertStrictRows(rows: readonly FrameLockRow[], endFrame: number): void {
  const accepted = rows.filter((row) => row.status === 'presented');
  expect(accepted.length).toBeGreaterThan(0);
  for (const row of accepted) {
    expect(row.desiredFrameIndex).toBe(row.presentedFrameIndex);
    expect(row.frameLag).toBe(0);
    expect(row.committed).toBe(true);
    expect(['video-frame-callback', 'packed-canvas-draw', 'packed-frame-barrier'])
      .toContain(row.evidence);
  }
  for (const row of rows.filter((candidate) => (
    candidate.status === 'presented'
      && (candidate.desiredFrameIndex === 0 || candidate.desiredFrameIndex === endFrame)
  ))) {
    expect(row.desiredFrameIndex).toBe(row.presentedFrameIndex);
  }
  const committedSequences = accepted.map((row) => row.sequence);
  expect(committedSequences).toEqual([...committedSequences].sort((left, right) => left - right));
  expect(rows.some((row) => row.evidence === 'seeked')).toBe(false);
}

test.describe('PH frame-lock spike', () => {
  test('PH deterministic sequence exposes only exact physical receipts', async ({ page }, testInfo) => {
    const surface = testInfo.project.name.startsWith('phone-') ? 'phone-ph' : 'desktop-ph';
    await page.goto(`/harness/frame-lock-spike?surface=${surface}&sequence=forward`, {
      waitUntil: 'domcontentloaded'
    });
    const result = await waitForSpike(page);
    if (result.status === 'static-fallback') {
      expect(result.errorCode).toBe('MEDIA_FRAME_CALLBACK_UNAVAILABLE');
      expect(result.rows.every((row) => row.status === 'stale' && row.evidence !== 'seeked')).toBe(true);
      return;
    }
    if (result.status === 'error') {
      expect(result.errorCode).toBe('MEDIA_SEEK_FAILED');
      expect(result.rows.every((row) => row.status === 'stale' && !row.committed)).toBe(true);
      return;
    }
    expect(result.status).toBe('ready');
    assertStrictRows(result.rows, 45);
  });

  test('PH endpoints and latest-wins keep stale work out of the presented clock', async ({ page }, testInfo) => {
    const surface = testInfo.project.name.startsWith('phone-') ? 'phone-ph' : 'desktop-ph';
    await page.goto(`/harness/frame-lock-spike?surface=${surface}&sequence=endpoints`, {
      waitUntil: 'domcontentloaded'
    });
    const initial = await waitForSpike(page, 3);
    if (initial.status === 'static-fallback') {
      expect(initial.errorCode).toBe('MEDIA_FRAME_CALLBACK_UNAVAILABLE');
      return;
    }
    if (initial.status === 'error') {
      expect(initial.errorCode).toBe('MEDIA_SEEK_FAILED');
      return;
    }
    const result = await page.evaluate(async () => {
      const api = window.__frameLockSpike;
      if (!api) throw new Error('frame-lock spike API is not installed');
      await api.runLatestWins(1, 45);
      return api.snapshot();
    });
    assertStrictRows(result.rows, 45);
    expect(result.rows.some((row) => row.status === 'stale')).toBe(true);
    expect(result.rows.find((row) => row.status === 'stale')?.committed).toBe(false);
    expect(result.presentedFrameIndex).toBe(45);
  });

  test('RVFC-unavailable fixture fails closed without promoting timing fallbacks', async ({ page }) => {
    await page.goto('/harness/frame-lock-spike?surface=desktop-ph&sequence=endpoints&rvfc=unavailable', {
      waitUntil: 'domcontentloaded'
    });
    const result = await waitForSpike(page, 0);
    expect(result.status).toBe('static-fallback');
    expect(result.errorCode).toBe('MEDIA_FRAME_CALLBACK_UNAVAILABLE');
    expect(await page.locator('[data-frame-lock-fallback]').textContent()).toContain('static fail-closed');
    expect(result.rows.every((row) => row.evidence === 'none' && !row.committed)).toBe(true);
  });

  test('the public root does not link to or preload the disposable Spike route', async ({ page }) => {
    const rootResponse = await page.request.get('/');
    expect(rootResponse.ok()).toBe(true);
    expect(await rootResponse.text()).not.toContain('frame-lock-spike');
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(requested.some((url) => /FrameLockSpikeHarness|frame-lock-spike/i.test(url))).toBe(false);
    expect(await page.locator('a[href*="/harness/frame-lock-spike"]').count()).toBe(0);
  });

  test('Crane packed-alpha surfaces commit atomically across all pressure sequences', async ({ page }) => {
    const cases: ReadonlyArray<readonly [string, number]> = [
      ['forward', 7],
      ['reverse', 5],
      ['endpoints', 3],
      ['random', 7],
      ['pressure', 8]
    ];
    for (const [sequence, minimumRows] of cases) {
      await page.goto(`/harness/frame-lock-spike?surface=phone-crane&sequence=${sequence}`, {
        waitUntil: 'domcontentloaded'
      });
      const result = await waitForSpike(page, minimumRows);
      if (result.status === 'static-fallback') {
        expect(result.errorCode).toBe('MEDIA_FRAME_CALLBACK_UNAVAILABLE');
        const retired = await page.evaluate(() => {
          const api = window.__frameLockSpike;
          if (!api) throw new Error('frame-lock spike API is not installed');
          api.retire();
          return api.snapshot();
        });
        expect(retired.webglContextsReleased).toBe(true);
        continue;
      }
      if (result.status === 'error') {
        expect(result.errorCode).toBe('MEDIA_SEEK_FAILED');
        expect(result.rows.every((row) => row.status === 'stale' && !row.committed)).toBe(true);
        const retired = await page.evaluate(() => {
          const api = window.__frameLockSpike;
          if (!api) throw new Error('frame-lock spike API is not installed');
          api.retire();
          return api.snapshot();
        });
        expect(retired.webglContextsReleased).toBe(true);
        continue;
      }
      expect(result.rows.filter((row) => row.status === 'presented')
        .every((row) => row.evidence === 'packed-frame-barrier')).toBe(true);
      expect(result.craneChildFrameLags.every((lag) => lag === 0)).toBe(true);
      const retired = await page.evaluate(() => {
        const api = window.__frameLockSpike;
        if (!api) throw new Error('frame-lock spike API is not installed');
        api.retire();
        return api.snapshot();
      });
      expect(retired.webglContextsReleased).toBe(true);
      expect(await page.locator('[data-frame-lock-packed-canvas]').evaluateAll((canvases) => (
        canvases.every((canvas) => (
          !canvas.hasAttribute('data-packed-alpha-status')
            && !canvas.hasAttribute('data-packed-alpha-frame-ready')
        ))
      ))).toBe(true);
    }
  });
});
