import { useEffect } from 'react';
import { directorRuntime, useDirectorSnapshot } from './harness-director';
import { normalizeInputDelta } from '../runtime/input-normalizer';
import type { DirectorEvent, Direction } from '../story/types';

function send(event: DirectorEvent): void {
  directorRuntime.send(event);
}

function stageEvent(type: 'STAGE_PAUSED' | 'STAGE_RESUMED'): DirectorEvent | null {
  const { context } = directorRuntime.getState();
  if (!context.activeRunId || !context.activeSegment) {
    return null;
  }
  return {
    type,
    runId: context.activeRunId,
    segment: context.activeSegment,
    stageIndex: context.pausePoint?.stageIndex ?? 0
  };
}

function fireCharge(direction: Direction): void {
  send({ type: 'CHARGE_FIRED', direction });
}

function fireRecovery(): void {
  const snapshot = directorRuntime.getState();
  const { context } = snapshot;
  if (snapshot.state === 'booting') {
    send({ type: 'BOOT_FAILED', error: new Error('boot failed') });
    return;
  }
  if (context.activeRunId) {
    send({ type: 'PLAYBACK_FAILED', runId: context.activeRunId, error: new Error('synthetic playback failed') });
    return;
  }
  if (context.prepareToken && context.pendingSegment) {
    send({ type: 'BUILD_TIMEOUT', segment: context.pendingSegment, prepareToken: context.prepareToken });
    return;
  }

  const direction = context.cursor.status === 'hold' && context.cursor.scene === 'contact' ? -1 : 1;
  send({ type: 'CHARGE_FIRED', direction });
  window.setTimeout(() => {
    const next = directorRuntime.getState().context;
    if (next.activeRunId) {
      send({ type: 'PLAYBACK_FAILED', runId: next.activeRunId, error: new Error('synthetic playback failed') });
    } else if (next.prepareToken && next.pendingSegment) {
      send({ type: 'BUILD_TIMEOUT', segment: next.pendingSegment, prepareToken: next.prepareToken });
    }
  }, 0);
}

export function MachineHarness() {
  const snapshot = useDirectorSnapshot();
  const context = snapshot.context;
  const pause = stageEvent('STAGE_PAUSED');
  const resume = stageEvent('STAGE_RESUMED');
  const layerWindow = context.layerWindow;
  const members = [layerWindow.prev, layerWindow.current, layerWindow.next].filter(Boolean);

  useEffect(() => {
    if (snapshot.state === 'booting') {
      send({ type: 'BOOT_READY' });
    }
  }, [snapshot.state]);

  return (
    <main
      className="harness-shell"
      onWheel={(event) => {
        const normalized = normalizeInputDelta({
          type: 'wheel',
          deltaY: event.deltaY,
          deltaMode: event.deltaMode as 0 | 1 | 2,
          viewportHeight: window.innerHeight
        });
        send({ type: 'INPUT_DELTA', ...normalized });
      }}
    >
      <section className="harness-stage" aria-label="synthetic machine stage">
        {members.map((scene) => (
          <div key={scene} className="synthetic-layer" data-current={scene === layerWindow.current}>
            <span>{scene}</span>
          </div>
        ))}
      </section>
      <aside className="harness-hud">
        <div className="harness-state">{String(snapshot.state)}</div>
        <dl className="hud-grid">
          <div>
            <dt>cursor</dt>
            <dd>{context.cursor.status === 'hold' ? context.cursor.scene : context.cursor.segment}</dd>
          </div>
          <div>
            <dt>charge</dt>
            <dd>{context.charge.value.toFixed(3)}</dd>
          </div>
          <div>
            <dt>virtualProgress</dt>
            <dd>{snapshot.virtualProgress.toFixed(3)}</dd>
          </div>
          <div>
            <dt>runId</dt>
            <dd>{context.activeRunId ?? '-'}</dd>
          </div>
          <div>
            <dt>prepareToken</dt>
            <dd>{context.prepareToken ?? '-'}</dd>
          </div>
        </dl>
        <div className="harness-controls">
          <button type="button" onClick={() => fireCharge(1)}>Forward</button>
          <button type="button" onClick={() => fireCharge(-1)}>Reverse</button>
          <button type="button" disabled={!pause} onClick={() => pause && send(pause)}>Pause</button>
          <button type="button" disabled={!resume} onClick={() => resume && send(resume)}>Resume</button>
          <button type="button" onClick={() => send({ type: 'SEEK', label: 'scene:brand', source: 'menu' })}>Seek</button>
          <button type="button" onClick={fireRecovery}>Fail</button>
        </div>
      </aside>
    </main>
  );
}
