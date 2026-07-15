export const DEFAULT_READING_EDGE_CONFIRMATION_PX = 16;

export type ReadingEdgeLatchState = 'free' | 'armed' | 'steady' | 'fired';

export type ReadingEdgeLatchInput = Readonly<{
  scope: string;
  pixels: number;
  startedAtEdge: boolean;
  reachedEdgeDuringInput: boolean;
  newGesture: boolean;
}>;

export type ReadingEdgeLatch = Readonly<{
  consume(input: ReadingEdgeLatchInput): Readonly<{
    state: ReadingEdgeLatchState;
    armed: boolean;
    fired: boolean;
  }>;
  mountAtEdge(scope: string): void;
  endGesture(): void;
  reset(): void;
}>;

/**
 * Reaching an edge during content scroll arms the handoff and absorbs the rest
 * of that physical gesture. A scene mounted at an edge starts steady, so its
 * first clear outward gesture can commit immediately.
 */
export function createReadingEdgeLatch(): ReadingEdgeLatch {
  let scope = '';
  let state: ReadingEdgeLatchState = 'free';
  let confirmation = 0;
  let confirming = false;

  const reset = () => {
    scope = '';
    state = 'free';
    confirmation = 0;
    confirming = false;
  };

  const result = (didFire = false) => ({
    state,
    armed: state !== 'free',
    fired: didFire
  });

  return {
    consume(input) {
      if (scope && scope !== input.scope) {
        reset();
      }
      scope = input.scope;

      if (state === 'free' && !(input.startedAtEdge && input.newGesture)) {
        if (input.startedAtEdge || input.reachedEdgeDuringInput) {
          state = 'armed';
        }
        return result();
      }
      if (state === 'free') {
        state = 'steady';
      }
      if (state === 'fired') {
        return result();
      }

      if (state === 'armed') {
        if (!input.newGesture) {
          return result();
        }
        state = 'steady';
        confirmation = 0;
        confirming = true;
      } else if (input.newGesture) {
        confirmation = 0;
        confirming = true;
      }

      if (!confirming) {
        return result();
      }
      confirmation += Math.abs(input.pixels);
      if (confirmation >= DEFAULT_READING_EDGE_CONFIRMATION_PX) {
        state = 'fired';
        confirming = false;
        return result(true);
      }
      return result();
    },
    mountAtEdge(nextScope) {
      scope = nextScope;
      state = 'steady';
      confirmation = 0;
      confirming = false;
    },
    endGesture() {
      if (state === 'armed') {
        state = 'steady';
      }
      confirmation = 0;
      confirming = false;
    },
    reset
  };
}
