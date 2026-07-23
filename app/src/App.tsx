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

type PhoneValidationMode = 'v16' | 'v17' | 'v18' | 'v19' | 'v20' | 'v21' | 'v22' | 'v23' | 'v24' | 'v25' | 'v26' | 'v27' | 'v28' | 'v29' | 'v30' | 'v31' | 'v32' | 'v33' | 'v34' | 'v35' | 'v36' | 'v37' | 'v38' | 'v39' | 'v40' | 'v42' | 'v43' | 'v44' | 'v45' | 'v46' | 'v47';

function requestedPhoneValidationMode(): PhoneValidationMode | undefined {
  if (!canUseDOM()) return undefined;
  const version = new URLSearchParams(window.location.search).get('v');
  return version === '16' || version === '17' || version === '18'
    || version === '19' || version === '20' || version === '21'
    || version === '22' || version === '23' || version === '24'
    || version === '25' || version === '26' || version === '27'
    || version === '28' || version === '29' || version === '30'
    || version === '31' || version === '32' || version === '33'
    || version === '34' || version === '35' || version === '36'
    || version === '37' || version === '38' || version === '39'
    || version === '40' || version === '42' || version === '43'
    || version === '44' || version === '45' || version === '46'
    || version === '47'
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
