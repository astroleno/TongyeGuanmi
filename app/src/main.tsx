import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { assertBrowserRuntime } from './runtime/browser-guard';

assertBrowserRuntime('React mount');

if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
  document.documentElement.dataset.storyHydrated = 'true';
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root was not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
