import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { assertBrowserRuntime } from './runtime/browser-guard';

assertBrowserRuntime('React mount');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root was not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
