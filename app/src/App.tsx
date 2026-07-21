import { lazy, Suspense, useState } from 'react';
import { canUseDOM } from './runtime/browser-guard';
import { initialPresentationFamily, type PresentationFamily } from './production/presentation-profile';
import {
  loadDesktopStoryShell,
  loadPhoneStoryShell
} from './production/presentation-shell-loaders';
import './styles.css';

const harnessEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_HARNESS === '1';
const HarnessRouter = harnessEnabled
  ? lazy(() => import('./harness/HarnessRouter').then(({ HarnessRouter: Router }) => ({ default: Router })))
  : null;
const DesktopStoryShell = lazy(loadDesktopStoryShell);
const PhoneStoryShell = lazy(loadPhoneStoryShell);
const phoneShellEnabled = import.meta.env.VITE_ENABLE_PHONE_STORY === '1';

type PhoneValidationMode = 'v16' | 'v17' | 'v18' | 'v19' | 'v20' | 'v21' | 'v22';

function requestedPhoneValidationMode(): PhoneValidationMode | undefined {
  if (!canUseDOM()) return undefined;
  const version = new URLSearchParams(window.location.search).get('v');
  return version === '16' || version === '17' || version === '18'
    || version === '19' || version === '20' || version === '21'
    || version === '22'
    ? `v${version}`
    : undefined;
}

function initialShellFamily(): PresentationFamily {
  if (!canUseDOM()) return 'desktop';
  // Unit 0–6 use this thin verification entry. Unit 7 removes the gate after
  // physical-device acceptance; an explicit release flag permits staged QA.
  if (requestedPhoneValidationMode()) return 'phone';
  return phoneShellEnabled && initialPresentationFamily() === 'phone' ? 'phone' : 'desktop';
}

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
  const phoneValidationMode = requestedPhoneValidationMode();
  // This state intentionally freezes the selected renderer. Rotating a phone
  // updates PhoneStoryShell geometry in place instead of remounting desktop.
  const [shellFamily] = useState(initialShellFamily);
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
  return (
    <Suspense fallback={<main className="route-loading">正在加载故事…</main>}>
      {shellFamily === 'phone'
        ? <PhoneStoryShell {...(phoneValidationMode ? { validationMode: phoneValidationMode } : {})} />
        : <DesktopStoryShell />}
    </Suspense>
  );
}
