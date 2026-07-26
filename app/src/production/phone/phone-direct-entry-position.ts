export type PhoneDirectEntryPositioner = Readonly<{
  dispose(): void;
}>;

export function createPhoneDirectEntryPositioner({
  target,
  scrollY,
  scrollTo,
  requestFrame,
  cancelFrame,
  onReady,
  targetOffset = () => 0,
  maxFrames = 600
}: Readonly<{
  target(): HTMLElement | null;
  targetOffset?(target: HTMLElement): number;
  scrollY(): number;
  scrollTo(y: number): void;
  requestFrame(callback: () => void): number;
  cancelFrame(frame: number): void;
  onReady(): void;
  maxFrames?: number;
}>): PhoneDirectEntryPositioner {
  let frame = 0;
  let attempts = 0;
  let settledFrames = 0;
  let active = true;
  const finish = () => {
    if (!active) return;
    active = false;
    frame = 0;
    onReady();
  };
  const inspect = () => {
    frame = 0;
    if (!active) return;
    attempts += 1;
    const element = target();
    if (element) {
      const offset = element.getBoundingClientRect().top
        + targetOffset(element);
      if (Math.abs(offset) > 1) {
        settledFrames = 0;
        scrollTo(scrollY() + offset);
      } else {
        settledFrames += 1;
        if (settledFrames >= 2) return finish();
      }
    }
    if (attempts >= Math.max(1, maxFrames)) finish();
    else frame = requestFrame(inspect);
  };
  frame = requestFrame(inspect);
  return {
    dispose() {
      if (!active) return;
      active = false;
      if (frame) cancelFrame(frame);
    }
  };
}
