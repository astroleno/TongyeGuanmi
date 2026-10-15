export type ReadingMotionOwner = Readonly<{
  ownerKey: object;
  readPosition(): number;
  readMax(): number;
  writePosition(position: number): void;
}>;

/** Desktop reading only. Frames never emit story input or own a gesture. */
export function createReadingSmoothMotion(clock: Readonly<{
  requestFrame(callback: (now: number) => void): number;
  cancelFrame(handle: number): void;
}>) {
  let owner: ReadingMotionOwner | null = null;
  let handle: number | null = null;
  let position = 0;
  let written = 0;
  let target = 0;
  let maximum = 0;
  let previous = 0;
  let lastInput = -Infinity;
  let direction = 0;
  let tau = 70;

  const cancel = () => {
    if (handle !== null) clock.cancelFrame(handle);
    handle = null;
    owner = null;
    direction = 0;
    lastInput = -Infinity;
  };
  const frame = (now: number) => {
    handle = null;
    if (!owner) return;
    // Focus, native scroll or navigation wins over an outstanding target.
    if (Math.abs(owner.readPosition() - written) > 1 || now - previous > 120) {
      cancel();
      return;
    }
    const alpha = 1 - Math.exp(-Math.max(0, now - previous) / tau);
    previous = now;
    position += (target - position) * alpha;
    const settled = Math.abs(target - position) <= 0.5;
    if (settled) position = target;
    owner.writePosition(position);
    // Browsers can quantize scrollTop; compare against the actual last write.
    written = owner.readPosition();
    if (settled) cancel();
    else handle = clock.requestFrame(frame);
  };
  return {
    bind(next: ReadingMotionOwner) {
      if (owner?.ownerKey === next.ownerKey) return;
      cancel();
      owner = next;
      position = target = written = owner.readPosition();
    },
    push({ deltaPx, now }: Readonly<{ deltaPx: number; now: number; gestureId?: number }>) {
      if (!owner || !Number.isFinite(deltaPx) || !Number.isFinite(now) || deltaPx === 0) return;
      const actual = owner.readPosition();
      const nextDirection = Math.sign(deltaPx);
      if (Math.abs(actual - written) > 1 || direction !== nextDirection) position = target = actual;
      written = actual;
      direction = nextDirection;
      maximum = Math.max(0, owner.readMax());
      target = Math.max(0, Math.min(maximum, target + deltaPx));
      tau = Math.abs(deltaPx) <= 40 && now - lastInput <= 50 ? 40 : 70;
      lastInput = now;
      if (handle === null && target !== position) {
        previous = now;
        handle = clock.requestFrame(frame);
      }
    },
    cancel,
    dispose: cancel
  };
}
