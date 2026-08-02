import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, appRouteForPath, type PhoneAppChunkRecovery } from './App';
import { initialPresentationFamily } from './production/presentation-profile';
import { assertBrowserRuntime } from './runtime/browser-guard';

assertBrowserRuntime('React mount');

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root was not found');
const mountRoot = rootElement;

const route = appRouteForPath(
  window.location.pathname,
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_HARNESS === '1'
);
const needsPhoneRecovery = route === 'brand-lab'
  || (route === 'formal' && initialPresentationFamily() === 'phone');

async function mount() {
  let recovery: PhoneAppChunkRecovery | null = null;
  if (needsPhoneRecovery) {
    const {
      createBrowserPhoneChunkRecoveryController,
      installPhoneChunkRecoveryController
    } = await import('./production/presentation-shell-loaders');
    const chunkRecovery = createBrowserPhoneChunkRecoveryController();
    installPhoneChunkRecoveryController(chunkRecovery);
    window.addEventListener('vite:preloadError', chunkRecovery.handlePreloadError);
    recovery = chunkRecovery;
  }
  createRoot(mountRoot).render(
    <StrictMode>
      <App chunkRecovery={recovery} />
    </StrictMode>
  );
}

void mount().catch(() => {
  createRoot(mountRoot).render(
    <StrictMode>
      <App chunkRecovery={null} />
    </StrictMode>
  );
});
