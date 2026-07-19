import { lazy, Suspense } from 'react';
import { canUseDOM } from './runtime/browser-guard';
import { StoryApp } from './production/StoryApp';
import { portraitSpikeRouteForSearch } from './production/portrait-spike/route';
import './styles.css';

const harnessEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_HARNESS === '1';
const HarnessRouter = harnessEnabled
  ? lazy(() => import('./harness/HarnessRouter').then(({ HarnessRouter: Router }) => ({ default: Router })))
  : null;
const portraitSpikeEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_PORTRAIT_SPIKE === '1';
const PortraitStageSpike = portraitSpikeEnabled
  ? lazy(() => import('./production/portrait-spike/PortraitStageSpike').then(({ PortraitStageSpike: Component }) => ({ default: Component })))
  : null;
const PortraitScrollSpike = portraitSpikeEnabled
  ? lazy(() => import('./production/portrait-spike/PortraitScrollSpike').then(({ PortraitScrollSpike: Component }) => ({ default: Component })))
  : null;

function NotFound() {
  return (
    <main className="route-not-found">
      <p>404</p>
      <h1>页面不存在</h1>
      <a href="/">返回同野观幂</a>
    </main>
  );
}

export function App() {
  const path = canUseDOM() ? window.location.pathname : '/';
  const portraitSpikeRoute = portraitSpikeEnabled && canUseDOM()
    ? portraitSpikeRouteForSearch(window.location.search)
    : undefined;
  if (path.startsWith('/harness/')) {
    if (!HarnessRouter) {
      return <NotFound />;
    }
    return (
      <Suspense fallback={<main className="route-loading">Loading harness…</main>}>
        <HarnessRouter path={path} />
      </Suspense>
    );
  }
  if (path !== '/' && path !== '/index.html') {
    return <NotFound />;
  }
  if (portraitSpikeRoute === 'a' && PortraitStageSpike) {
    return (
      <Suspense fallback={<main className="route-loading">Loading portrait spike…</main>}>
        <PortraitStageSpike />
      </Suspense>
    );
  }
  if (portraitSpikeRoute === 'b' && PortraitScrollSpike) {
    return (
      <Suspense fallback={<main className="route-loading">Loading portrait spike…</main>}>
        <PortraitScrollSpike />
      </Suspense>
    );
  }
  return <StoryApp />;
}
