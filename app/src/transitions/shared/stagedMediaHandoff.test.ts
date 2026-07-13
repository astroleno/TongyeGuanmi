import { describe, expect, it } from 'vitest';
import { createBackHalfDomContext } from '../__fixtures__/back-half.fixture';
import {
  createStagedMediaHandoff,
  sampleStagedMediaHandoff,
  type StagedMediaRenderContext
} from './stagedMediaHandoff';

function preparationSignal(): AbortSignal {
  return new AbortController().signal;
}

describe('staged media handoff', () => {
  it('keeps source and receiver opacity complementary throughout the dissolve leg', () => {
    const stop = 2500 / 3100;

    for (const progress of [stop, (stop + 1) / 2, 0.95, 1]) {
      const sample = sampleStagedMediaHandoff(progress, stop);
      expect(sample.from.opacity + sample.to.opacity).toBeCloseTo(1, 8);
    }

    const midpoint = sampleStagedMediaHandoff((stop + 1) / 2, stop);
    expect(midpoint.from).toMatchObject({ visible: true, inert: true, pointerEvents: 'none' });
    expect(midpoint.to).toMatchObject({ visible: true, inert: true, pointerEvents: 'none' });
  });

  it('holds terminal media during dissolve and limits diagnostics to the active leg', async () => {
    const fixture = createBackHalfDomContext('ttg-lab', 'ttg-animation', 'lab');
    const renders: Array<{ progress: number; direction: number; runId: string }> = [];
    const transition = createStagedMediaHandoff({
      id: 'ttg-lab',
      prepareEndpoints: () => undefined,
      renderSource: (_root, progress, context) => {
        renders.push({ progress, direction: context.direction, runId: context.runId });
      }
    });
    const timeline = await transition.buildTimeline(fixture.context);
    const stop = fixture.context.segment.policy.kind === 'stagedSnap'
      ? fixture.context.segment.policy.stops[0] ?? 0
      : 0;

    expect((timeline as typeof timeline & { prepareLeg?: unknown }).prepareLeg).toBeTypeOf('function');

    timeline.progress(stop);
    const renderCountAtStop = renders.length;
    timeline.progress((stop + 1) / 2);
    timeline.progress((stop + 2) / 3);

    expect(renders).toHaveLength(renderCountAtStop);
    expect(renders.at(-1)).toEqual({
      progress: 1,
      direction: 1,
      runId: fixture.context.runId
    });
    expect(fixture.stage.children[0]?.dataset).toMatchObject({
      r4Handoff: 'dissolve',
      r4HandoffSegment: 'ttg-lab'
    });
    expect(timeline.effectCanvases?.()).toEqual([]);

    timeline.progress(1);
    expect(fixture.stage.children[0]?.dataset.r4Handoff).toBeUndefined();
    expect(fixture.stage.children[1]?.dataset.r4Handoff).toBeUndefined();

    timeline.progress((stop + 1) / 2);
    timeline.dispose();
    expect(fixture.stage.children[0]?.dataset.r4Handoff).toBeUndefined();
    expect(fixture.stage.children[1]?.dataset.r4Handoff).toBeUndefined();
  });

  it('waits for reverse terminal leg readiness while keeping the source hidden', async () => {
    const fixture = createBackHalfDomContext('ph-education', 'ph-animation', 'education');
    let releaseTerminal: (() => void) | undefined;
    let preparedContext: StagedMediaRenderContext | undefined;
    const terminalReady = new Promise<void>((resolve) => {
      releaseTerminal = resolve;
    });
    const transition = createStagedMediaHandoff({
      id: 'ph-education',
      prepareEndpoints: () => undefined,
      prepareLeg: (_root, _leg, context) => {
        preparedContext = context;
        return terminalReady;
      },
      renderSource: () => undefined
    });
    const reverseContext = {
      ...fixture.context,
      direction: -1,
      runId: 'handoff-reverse:1',
      prepareToken: 'handoff-reverse:prepare:1'
    } as const;
    const timeline = await transition.buildTimeline(reverseContext);
    const stop = reverseContext.segment.policy.kind === 'stagedSnap'
      ? reverseContext.segment.policy.stops[0] ?? 0
      : 0;
    const preparation = Promise.resolve(timeline.prepareLeg?.({
      runId: reverseContext.runId,
      segment: 'ph-education',
      direction: -1,
      legIndex: 1,
      from: 1,
      to: stop,
      durationMs: 600,
      signal: preparationSignal()
    }));
    let resolved = false;
    void preparation.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(fixture.fromLayer.visibility.opacity).toBe(0);
    expect(fixture.toLayer.visibility.opacity).toBe(1);
    expect(preparedContext).toMatchObject({
      direction: -1,
      runId: 'handoff-reverse:1'
    });

    releaseTerminal?.();
    await expect(preparation).resolves.toBeUndefined();
  });

  it('commits a prepared leg endpoint once and delegates source disposal explicitly', async () => {
    const fixture = createBackHalfDomContext('ttg-lab', 'ttg-animation', 'lab');
    const commits: number[] = [];
    const disposals: number[] = [];
    const transition = createStagedMediaHandoff({
      id: 'ttg-lab',
      prepareEndpoints: () => undefined,
      prepareLeg: () => Promise.resolve(),
      commitLegEndpoint: (_root, leg) => commits.push(leg.to),
      disposeSource: (_root, progress) => disposals.push(progress),
      renderSource: () => undefined
    });
    const timeline = await transition.buildTimeline(fixture.context);
    const stop = fixture.context.segment.policy.kind === 'stagedSnap'
      ? fixture.context.segment.policy.stops[0] ?? 0
      : 0;

    await timeline.prepareLeg?.({
      runId: fixture.context.runId,
      segment: 'ttg-lab',
      direction: -1,
      legIndex: 0,
      from: stop,
      to: 0,
      durationMs: 2500,
      resumedStageIndex: 0,
      signal: preparationSignal()
    });
    timeline.progress(stop / 2);
    expect(commits).toEqual([]);
    timeline.progress(0);
    timeline.progress(0);
    expect(commits).toEqual([0]);

    timeline.dispose();
    expect(disposals).toEqual([0]);
  });
});
