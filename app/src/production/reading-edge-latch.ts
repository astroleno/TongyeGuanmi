export const DEFAULT_READING_EDGE_IDLE_MS = 220;
export const DEFAULT_READING_EDGE_CONFIRMATION_PX = 16;

export type ReadingEdgeLatchInput = Readonly<{
  scope: string;
  pixels: number;
  now: number;
  atEdge: boolean;
  forceNewGesture?: boolean;
}>;

export type ReadingEdgeLatch = Readonly<{
  consume(input: ReadingEdgeLatchInput): Readonly<{ armed: boolean; fired: boolean }>;
  endGesture(): void;
  reset(): void;
}>;

/**
 * A reading-edge gesture only arms the handoff. The next independent physical
 * gesture must cross 16px before it can leave the current reading scene.
 */
export function createReadingEdgeLatch(): ReadingEdgeLatch {
  let scope = '';
  let lastAt = -1;
  let armed = false;
  let ignoreCurrentGesture = false;
  let confirmation = 0;
  let fired = false;

  const reset = () => {
    scope = '';
    lastAt = -1;
    armed = false;
    ignoreCurrentGesture = false;
    confirmation = 0;
    fired = false;
  };

  return {
    consume(input) {
      const newGesture = input.forceNewGesture
        || scope !== input.scope
        || lastAt < 0
        || input.now - lastAt > DEFAULT_READING_EDGE_IDLE_MS;
      if (scope && scope !== input.scope) {
        reset();
      }
      scope = input.scope;
      lastAt = input.now;

      if (!armed) {
        if (input.atEdge) {
          armed = true;
          ignoreCurrentGesture = true;
        }
        return { armed, fired: false };
      }
      if (fired) {
        return { armed: true, fired: false };
      }
      if (ignoreCurrentGesture) {
        if (!newGesture) {
          return { armed: true, fired: false };
        }
        ignoreCurrentGesture = false;
      }
      confirmation = newGesture ? 0 : confirmation;
      confirmation += Math.abs(input.pixels);
      fired = confirmation >= DEFAULT_READING_EDGE_CONFIRMATION_PX;
      return { armed: true, fired };
    },
    endGesture() {
      lastAt = -1;
    },
    reset
  };
}
