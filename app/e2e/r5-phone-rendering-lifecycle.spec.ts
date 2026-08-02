import { expect, test, type Page } from '@playwright/test';
import {
  assertSinglePhoneAuthority,
  readCommitSequence,
  waitForCommitSequence
} from './r5-phone-clean-assertions';

async function sendIntent(page: Page, direction: 'forward' | 'reverse'): Promise<void> {
  await page.keyboard.press(direction === 'forward' ? 'ArrowDown' : 'ArrowUp');
}

async function completeAdjacentLeg(
  page: Page,
  source: string,
  target: string,
  direction: 'forward' | 'reverse'
): Promise<void> {
  const before = await readCommitSequence(page);
  await sendIntent(page, direction);
  await page.waitForFunction(({ expected, after }) => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    const sequence = Number.parseInt(shell?.dataset.phoneCommitSequence ?? '', 10);
    return shell?.dataset.phoneStatus === 'transaction'
      || shell?.dataset.phoneScene === expected && sequence > after;
  }, { expected: target, after: before });
  for (let boundary = 0; boundary < 6; boundary += 1) {
    const handle = await page.waitForFunction(({ from, to, after }) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      const state = {
        scene: shell?.dataset.phoneScene,
        status: shell?.dataset.phoneStatus,
        phase: shell?.dataset.phonePhase,
        sequence: Number.parseInt(shell?.dataset.phoneCommitSequence ?? '', 10)
      };
      return state.scene === to && state.sequence > after
        || state.status === 'stable' && state.scene === from
        || ['awaiting-media-activation', 'awaiting-leg-intent'].includes(state.phase ?? '')
        ? state : null;
    }, { from: source, to: target, after: before }, { timeout: 30_000 });
    const state = await handle.jsonValue();
    if (state.scene === target && state.sequence > before) break;
    if (state.status === 'stable') {
      throw new Error(`${source} → ${target} rolled back: ${JSON.stringify(state)}`);
    }
    if (state.phase === 'awaiting-media-activation') {
      await page.locator('[data-phone-activation]:not([hidden])').click();
    } else if (state.phase === 'awaiting-leg-intent') {
      await sendIntent(page, direction);
    }
  }
  await waitForCommitSequence(page, target, before);
}

test('clean PH packed-alpha reactivation and Lab Ink recreation never reuse a lost context', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const instrumented = window as Window & { __r5ContextLosses?: string[] };
    instrumented.__r5ContextLosses = [];
    window.addEventListener('webglcontextlost', (event) => {
      const canvas = event.target as HTMLCanvasElement | null;
      instrumented.__r5ContextLosses?.push(
        canvas?.dataset.phonePackedAlphaCanvas
          ?? canvas?.dataset.r4InkSegment
          ?? 'unknown'
      );
    }, true);
  });

  await page.goto('/#ph-animation', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'ph-animation', 0);
  await assertSinglePhoneAuthority(page);
  const phCanvas = page.locator('[data-phone-packed-alpha-canvas="ph-figure"]');
  await phCanvas.evaluate((canvas) => { canvas.dataset.r5LifecycleIdentity = 'ph-canvas'; });
  expect(await phCanvas.evaluate((canvas) => (
    canvas.getContext('webgl')?.isContextLost() ?? true
  ))).toBe(false);

  await completeAdjacentLeg(page, 'ph-animation', 'education', 'forward');
  await completeAdjacentLeg(page, 'education', 'ph-animation', 'reverse');
  await expect(phCanvas).toHaveAttribute('data-r5-lifecycle-identity', 'ph-canvas');
  expect(await phCanvas.evaluate((canvas) => ({
    contextLost: canvas.getContext('webgl')?.isContextLost() ?? true,
    status: canvas.dataset.packedAlphaStatus
  }))).toMatchObject({ contextLost: false });
  await expect(phCanvas).not.toHaveAttribute('data-packed-alpha-status', 'setup-failed');

  await page.goto('/#lab', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'lab', 0);
  const before = await readCommitSequence(page);
  await sendIntent(page, 'forward');
  const ink = page.locator('[data-r4-ink-segment="lab-ph"]');
  await expect(ink).toBeAttached();
  expect(await ink.evaluate((canvas) => (
    canvas.getContext('webgl')?.isContextLost() ?? true
  ))).toBe(false);
  for (let boundary = 0; boundary < 4; boundary += 1) {
    if (await page.locator('.phone-story').getAttribute('data-phone-scene') === 'ph-animation'
      && await readCommitSequence(page) > before) break;
    const phase = await page.locator('.phone-story').getAttribute('data-phone-phase');
    if (phase === 'awaiting-media-activation') {
      await page.locator('[data-phone-activation]:not([hidden])').click();
    } else if (phase === 'awaiting-leg-intent') {
      await sendIntent(page, 'forward');
    }
    await page.waitForTimeout(50);
  }
  await waitForCommitSequence(page, 'ph-animation', before);
  expect(await page.evaluate(() => (
    (window as Window & { __r5ContextLosses?: string[] }).__r5ContextLosses ?? []
  ))).toEqual([]);
});
