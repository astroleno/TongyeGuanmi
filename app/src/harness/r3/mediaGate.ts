import type { Direction, SpineSegmentNode } from '../../story/types';

export function shouldWaitForPilotMediaReady(segment: SpineSegmentNode, direction: Direction): boolean {
  if (segment.id !== 'aod-method-top') {
    return false;
  }
  const contract = segment.mediaPlayback?.[0];
  if (!contract) {
    return false;
  }
  return direction === 1 ? contract.forward.required : contract.reverse.required;
}
