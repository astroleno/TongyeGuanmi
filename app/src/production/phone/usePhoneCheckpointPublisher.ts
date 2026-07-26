import {
  useCallback,
  useRef,
  type RefObject
} from 'react';
import type { PhoneCheckpointId } from '../../story/semantic-checkpoints';

export function usePhoneCheckpointPublisher(
  initialCheckpoint: PhoneCheckpointId,
  rootRef: RefObject<HTMLElement | null>
) {
  const checkpointRef = useRef<PhoneCheckpointId>(initialCheckpoint);
  const traceRef = useRef<PhoneCheckpointId[]>([initialCheckpoint]);
  const publish = useCallback((checkpoint: PhoneCheckpointId) => {
    const root = rootRef.current;
    if (!root) return;
    if (checkpointRef.current !== checkpoint) {
      checkpointRef.current = checkpoint;
      traceRef.current = [...traceRef.current.slice(-63), checkpoint];
    }
    const trace = traceRef.current.join('>');
    root.dataset.portraitCheckpoint = checkpoint;
    root.dataset.portraitCheckpointTrace = trace;
    document.documentElement.dataset.portraitCheckpoint = checkpoint;
  }, [rootRef]);
  return { checkpointRef, traceRef, publish };
}
