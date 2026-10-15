import { describe, expect, it, vi } from 'vitest';
const states = vi.hoisted(() => new WeakMap<object, Record<string, unknown>>());
vi.mock('./timeline-video-driver', () => ({ timelineVideoDriverFor: (video: object) => ({ snapshot: () => states.get(video) }) }));
import { createScrollMediaCoherence } from './scroll-media-coherence';
import { deferScrollMediaRequest, registerScrollMediaCompositor, scrollMediaSamplingPhase } from './scroll-media-sampling';
import { createScrollSpine, locateScrollPosition } from '../story/scroll-spine';

describe('atomic scroll media sampling', () => {
  const index = createScrollSpine({ viewportHeight: 1000 });
  const range = index.ranges.find(r => r.id === 'hero-pattern')!;
  // This fixture tests media ownership, not pixel-to-progress roundoff.
  const pose = (progress: number) => ({ ...locateScrollPosition(index, range.start + (range.end - range.start) * progress), progress });
  const intent = (revision: number, epoch = 1) => ({ generation: 1, layoutRevision: 1, revision, epoch });
  const video = () => {
    const element = { dataset: {} } as HTMLVideoElement;
    states.set(element, { generation: 1, targetTime: 0 });
    Object.defineProperty(states.get(element)!, 'presentedPlayheadTime', { get: () => states.get(element)!.provenPhysicalTime ?? states.get(element)!.presentedTime });
    Object.defineProperty(element, 'currentTime', { get: () => states.get(element)!.physicalTime ?? states.get(element)!.presentedTime ?? 0 });
    return element;
  };
  it('commits a decoded prior sample while submitting the latest target without starvation', () => {
    const media = video(); const coordinator = createScrollMediaCoherence([media]);
    const paints: Array<[string, number]> = [];
    const paint = (position: ReturnType<typeof pose>) => {
      paints.push([scrollMediaSamplingPhase(), position.progress]);
      deferScrollMediaRequest(media, () => { states.get(media)!.targetTime = position.progress * 10; });
    };
    expect(coordinator.render(pose(.2), intent(1), paint)).toBeNull();
    Object.assign(states.get(media)!, { presentedTime: 2, presentedGeneration: 1 });
    expect(coordinator.render(pose(.8), intent(2), paint)).toMatchObject({ progress: .2, revision: 1 });
    expect(states.get(media)!.targetTime).toBe(8);
    expect(paints.at(-1)).toEqual(['present', .2]);
    Object.assign(states.get(media)!, { presentedTime: 8 });
    expect(coordinator.render(pose(.8), intent(3), paint)).toMatchObject({ progress: .8 });
    coordinator.dispose(); expect(media.dataset.scrollMediaCoherent).toBeUndefined();
  });
  it('requires both decoder lanes to match the same pose and rejects the old reverse epoch', () => {
    const pair = [video(), video()]; const coordinator = createScrollMediaCoherence(pair);
    const paint = (position: ReturnType<typeof pose>) => pair.forEach((media, i) => {
      deferScrollMediaRequest(media, () => { states.get(media)!.targetTime = position.progress * (i + 1); });
    });
    coordinator.render(pose(.2), intent(1), paint);
    Object.assign(states.get(pair[0]!)!, { presentedTime: .2, presentedGeneration: 1 });
    Object.assign(states.get(pair[1]!)!, { presentedTime: .8, presentedGeneration: 1 });
    expect(coordinator.render(pose(.4), intent(2), paint)).toBeNull();
    Object.assign(states.get(pair[1]!)!, { presentedTime: .4 });
    expect(coordinator.render(pose(.4), intent(3), paint)).toMatchObject({ progress: .2 });
    expect(coordinator.render(pose(.1), intent(4, 2), paint)).toBeNull();
  });
  it('flushes the decoded Canvas inside the accepted pose and rejects failed composition', () => {
    const media = video();
    const render = vi.fn(() => scrollMediaSamplingPhase() === 'present');
    const unregister = registerScrollMediaCompositor(media, render);
    const coordinator = createScrollMediaCoherence([media]);
    const paint = (p: ReturnType<typeof pose>) => { deferScrollMediaRequest(media, () => { states.get(media)!.targetTime = p.progress; }); };
    coordinator.render(pose(.2), intent(1), paint);
    Object.assign(states.get(media)!, { presentedTime: .2, presentedGeneration: 1 });
    expect(coordinator.render(pose(.2), intent(2), paint)).toMatchObject({ progress: .2 });
    expect(render).toHaveBeenCalledOnce();
    render.mockReturnValue(false);
    expect(coordinator.render(pose(.2), intent(3), paint)).toBeNull();
    unregister(); coordinator.dispose();
  });
  it('does not let a fast Crane decoder run ahead while its paired lane is still seeking', () => {
    const pair = [video(), video()]; const coordinator = createScrollMediaCoherence(pair);
    const paint = (p: ReturnType<typeof pose>) => pair.forEach((media, i) => {
      deferScrollMediaRequest(media, () => { states.get(media)!.targetTime = p.progress * (i + 1); });
    });
    coordinator.render(pose(.2), intent(1), paint);
    Object.assign(states.get(pair[0]!)!, { presentedTime: .2, presentedGeneration: 1 });
    coordinator.render(pose(.4), intent(2), paint);
    coordinator.render(pose(.6), intent(3), paint);
    expect(states.get(pair[0]!)!.targetTime).toBe(.2);
    Object.assign(states.get(pair[1]!)!, { presentedTime: .4, presentedGeneration: 1 });
    expect(coordinator.render(pose(.8), intent(4), paint)).toMatchObject({ progress: .2 });
    expect(states.get(pair[0]!)!.targetTime).toBe(.8);
    expect(states.get(pair[1]!)!.targetTime).toBe(1.6);
    coordinator.dispose();
  });
  it('retains the last canvas while the decoder has moved beyond its old proof', () => {
    const media = video(); const coordinator = createScrollMediaCoherence([media]);
    const render = vi.fn(() => true); const unregister = registerScrollMediaCompositor(media, render);
    const paint = (p: ReturnType<typeof pose>) => { deferScrollMediaRequest(media, () => { states.get(media)!.targetTime = p.progress; }); };
    coordinator.render(pose(.2), intent(1), paint);
    Object.assign(states.get(media)!, { presentedTime: .2, presentedGeneration: 1 });
    coordinator.render(pose(.4), intent(2), paint);
    render.mockClear();
    states.get(media)!.physicalTime = .4;
    expect(coordinator.render(pose(.5), intent(3), paint)).toBeNull();
    expect(render).not.toHaveBeenCalled();
    states.get(media)!.presentedTime = .4;
    expect(coordinator.render(pose(.5), intent(4), paint)).toMatchObject({ progress: .4 });
    unregister(); coordinator.dispose();
  });
  it('accepts a proven reused terminal frame without requiring an unquantized playhead', () => {
    const media = video(); const coordinator = createScrollMediaCoherence([media]);
    const paint = (p: ReturnType<typeof pose>) => { deferScrollMediaRequest(media, () => { states.get(media)!.targetTime = p.progress * 10; }); };
    coordinator.render(pose(.2012), intent(1), paint);
    Object.assign(states.get(media)!, { presentedTime: 2.012, presentedGeneration: 1, provenPhysicalTime: 2, physicalTime: 2 });
    expect(coordinator.render(pose(.8), intent(2), paint)).toMatchObject({ progress: .2012 });
    states.get(media)!.physicalTime = 3;
    expect(coordinator.render(pose(.8), intent(3), paint)).toBeNull();
    coordinator.dispose();
  });
  it('late disposal cannot remove a replacement compositor scope', () => {
    const media = video(); const old = createScrollMediaCoherence([media]);
    const current = createScrollMediaCoherence([media]); old.dispose();
    expect(media.dataset.scrollMediaCoherent).toBe('true');
    current.dispose(); expect(media.dataset.scrollMediaCoherent).toBeUndefined();
  });
  it('retries the waiting pair after native priming resets a decoder target', () => {
    const pair = [video(), video()]; const coordinator = createScrollMediaCoherence(pair);
    const paint = (p: ReturnType<typeof pose>) => pair.forEach((media, i) => {
      deferScrollMediaRequest(media, () => { states.get(media)!.targetTime = p.progress * (i + 1); });
    });
    coordinator.render(pose(.2), intent(1), paint);
    states.get(pair[1]!)!.targetTime = 0;
    coordinator.render(pose(.8), intent(2), paint);
    expect(states.get(pair[0]!)!.targetTime).toBe(.2);
    expect(states.get(pair[1]!)!.targetTime).toBe(.4);
    coordinator.dispose();
  });
  it('refreshes a paired pose when loadedmetadata corrects its quantized source time', () => {
    const pair = [video(), video()]; const coordinator = createScrollMediaCoherence(pair);
    let duration = 2;
    const paint = (p: ReturnType<typeof pose>) => pair.forEach((media) => {
      deferScrollMediaRequest(media, () => { states.get(media)!.targetTime = p.progress * duration; });
    });
    coordinator.render(pose(.5), intent(1), paint);
    duration = 1.8;
    for (const media of pair) Object.assign(states.get(media)!, { presentedTime: .9, presentedGeneration: 1 });
    coordinator.render(pose(.8), intent(2), paint);
    expect(coordinator.render(pose(.8), intent(3), paint)).toMatchObject({ progress: .5, revision: 1 });
    coordinator.dispose();
  });
});
