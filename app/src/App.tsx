import { storyManifest } from './story/manifest';
import { canUseDOM } from './runtime/browser-guard';
import { MachineHarness } from './harness/MachineHarness';
import { DevtoolsHarness } from './harness/DevtoolsHarness';
import { StageHarness } from './harness/StageHarness';
import { PilotHarness } from './harness/r3/PilotHarness';
import './styles.css';

const holdCount = storyManifest.nodes.filter((node) => node.kind === 'hold').length;
const segmentCount = storyManifest.nodes.filter((node) => node.kind === 'segment').length;

export function App() {
  const path = canUseDOM() ? window.location.pathname : '/';
  if (path === '/harness/machine') {
    return <MachineHarness />;
  }
  if (path === '/harness/devtools') {
    return <DevtoolsHarness />;
  }
  if (path === '/harness/stage') {
    return <StageHarness />;
  }
  if (path === '/harness/r3-pilot') {
    return <PilotHarness mode="pilot" />;
  }
  if (path === '/harness/aod-animation') {
    return <PilotHarness mode="aod-animation" />;
  }
  if (path === '/harness/star-map-aod') {
    return <PilotHarness mode="star-map-aod" />;
  }
  if (path === '/harness/aod-method-top') {
    return <PilotHarness mode="aod-method-top" />;
  }

  return (
    <main className="app-shell" data-testid="r0-scaffold">
      <section className="app-panel" aria-labelledby="runtime-title">
        <p className="app-kicker">React R0 Scaffold</p>
        <h1 id="runtime-title">同野观幂 Story Runtime</h1>
        <dl className="app-facts" aria-label="manifest scaffold facts">
          <div>
            <dt>holds</dt>
            <dd>{holdCount}</dd>
          </div>
          <div>
            <dt>segments</dt>
            <dd>{segmentCount}</dd>
          </div>
          <div>
            <dt>browser guarded</dt>
            <dd>{canUseDOM() ? 'yes' : 'ssr'}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
