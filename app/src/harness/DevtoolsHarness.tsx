import { directorRuntime, useDirectorSnapshot } from '../runtime/director.actor';

function formatValue(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, item: unknown) => {
      if (item instanceof Error) {
        return { name: item.name, message: item.message };
      }
      return item;
    },
    2
  );
}

export function DevtoolsHarness() {
  const snapshot = useDirectorSnapshot();

  return (
    <main className="devtools-shell">
      <header className="devtools-header">
        <div>
          <p className="app-kicker">Director Devtools</p>
          <h1>Runtime Trace</h1>
        </div>
        <button type="button" onClick={() => directorRuntime.send({ type: 'BOOT_READY' })}>Boot</button>
      </header>
      <section className="devtools-summary" aria-label="director snapshot">
        <pre>{formatValue({
          state: snapshot.state,
          actorEpoch: snapshot.context.actorEpoch,
          activeRunId: snapshot.context.activeRunId,
          prepareToken: snapshot.context.prepareToken,
          queuedIntent: snapshot.context.queuedIntent,
          pausePoint: snapshot.context.pausePoint,
          cursor: snapshot.context.cursor,
          virtualProgress: snapshot.virtualProgress,
          LayerWindow: snapshot.context.layerWindow
        })}</pre>
      </section>
      <section className="event-list" aria-label="event ring buffer">
        {snapshot.eventLog.map((record) => (
          <article key={record.id} className="event-record">
            <div className="event-record-head">
              <strong>{record.event.type}</strong>
              <span>{record.id}</span>
            </div>
            <pre>{formatValue({
              runId: record.activeRunId,
              prepareToken: record.prepareToken,
              queuedIntent: record.queuedIntent,
              pausePoint: record.pausePoint,
              cursor: record.cursor,
              LayerWindow: record.layerWindow,
              milestone: record.milestone,
              event: record.event
            })}</pre>
          </article>
        ))}
      </section>
    </main>
  );
}
