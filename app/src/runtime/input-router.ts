import type { Direction, SegmentPolicy, StoryCursor } from '../story/types';

export type DirectorDiscreteState =
  | 'booting'
  | 'hold'
  | 'preparing'
  | 'scrubbing'
  | 'playing'
  | 'staged-paused'
  | 'settling'
  | 'recovering'
  | 'seeking';

export type InputRoute =
  | { path: 'innerScroll'; delta: number }
  | { path: 'scrub'; delta: number }
  | { path: 'charge'; delta: number; direction: Direction }
  | { path: 'chargeResume'; delta: number; direction: Direction }
  | { path: 'intentBuffer'; delta: number; direction: Direction }
  | { path: 'none'; delta: number };

export type InputRouterState = {
  state: DirectorDiscreteState;
  cursor: StoryCursor;
  delta: number;
  readingCanScroll?: boolean;
  segmentPolicy?: SegmentPolicy;
};

function direction(delta: number): Direction {
  return delta >= 0 ? 1 : -1;
}

export function routeInput(input: InputRouterState): InputRoute {
  if (input.delta === 0) {
    return { path: 'none', delta: input.delta };
  }

  switch (input.state) {
    case 'hold':
      if (input.cursor.status === 'hold' && input.readingCanScroll) {
        return { path: 'innerScroll', delta: input.delta };
      }
      if (input.segmentPolicy?.kind === 'scrub') {
        return { path: 'scrub', delta: input.delta };
      }
      return { path: 'charge', delta: input.delta, direction: direction(input.delta) };
    case 'scrubbing':
      return { path: 'scrub', delta: input.delta };
    case 'playing':
    case 'settling':
      return { path: 'intentBuffer', delta: input.delta, direction: direction(input.delta) };
    case 'staged-paused':
      return { path: 'chargeResume', delta: input.delta, direction: direction(input.delta) };
    case 'booting':
    case 'preparing':
    case 'recovering':
    case 'seeking':
      return { path: 'none', delta: input.delta };
  }
}
