import { phoneSegmentChoreographyFrame, type PhoneSegmentChoreographyFrame, type PhoneSegmentId } from './manifest';
import { scrollAuthoredProgress } from '../../story/scroll-spine';

/** Preserve every authored relationship; only gesture and delay clocks retire. */
export function phoneScrollChoreographyFrame(segmentId: PhoneSegmentId, progress: number): PhoneSegmentChoreographyFrame {
  return phoneSegmentChoreographyFrame(segmentId, scrollAuthoredProgress(segmentId, progress), 'forward');
}
