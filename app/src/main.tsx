import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { assertBrowserRuntime } from './runtime/browser-guard';

const PhoneBrandLabScope = lazy(() => import('./production/phone/scenes/PhoneBrandLabScope').then(({
  PhoneBrandLabScope: Component
}) => ({ default: Component })));

function phoneBrandLabScopeRequested(): boolean {
  return new URLSearchParams(window.location.search).get('scope') === 'brand-lab';
}

assertBrowserRuntime('React mount');

if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
  document.documentElement.dataset.storyHydrated = 'true';
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root was not found');
}
const brandLabScope = phoneBrandLabScopeRequested();

if (brandLabScope) {
  document.getElementById('story-loader-static')?.remove();
}

if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
  document.getElementById('story-loader-static')?.remove();
}

const root = createRoot(rootElement);

if (brandLabScope) {
  root.render(
    <StrictMode>
      <Suspense fallback={<main className="route-loading">正在准备 Brand → Lab…</main>}>
        <PhoneBrandLabScope />
      </Suspense>
    </StrictMode>
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
