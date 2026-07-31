import {
  Component,
  lazy,
  Suspense,
  useState,
  type ReactNode
} from 'react';
import { canUseDOM } from './runtime/browser-guard';
import { initialPresentationFamily, type PresentationFamily } from './production/presentation-profile';
import { revealStaticPhoneStoryFallback } from './production/phone-story-fallback';
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
/** Numbered `?v=` routes are an opt-in diagnostics artifact, never release routing. */
const phoneValidationEnabled = import.meta.env.VITE_ENABLE_PHONE_VALIDATION === '1';

type PhoneStoryErrorBoundaryProps = Readonly<{ children: ReactNode }>;
type PhoneStoryErrorBoundaryState = Readonly<{ failed: boolean }>;

class PhoneStoryErrorBoundary extends Component<
  PhoneStoryErrorBoundaryProps,
  PhoneStoryErrorBoundaryState
> {
  state: PhoneStoryErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): PhoneStoryErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(): void {
    revealStaticPhoneStoryFallback('shell-error');
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

type PhoneValidationMode = 'v16' | 'v17' | 'v18' | 'v19' | 'v20' | 'v21' | 'v22' | 'v23' | 'v24' | 'v25' | 'v26' | 'v27' | 'v28' | 'v29' | 'v30' | 'v31' | 'v32' | 'v33' | 'v34' | 'v35' | 'v36' | 'v37' | 'v38' | 'v39' | 'v40' | 'v42' | 'v43' | 'v44' | 'v45' | 'v46' | 'v47';

function requestedPhoneValidationMode(): PhoneValidationMode | undefined {
  if (!phoneValidationEnabled || !canUseDOM()) return undefined;
  const version = new URLSearchParams(window.location.search).get('v');
  return version && /^(?:1[6-9]|[23]\d|40|4[2-7])$/.test(version)
      ? `v${version}` as PhoneValidationMode
    : undefined;
}

function initialShellFamily(): PresentationFamily {
  if (!canUseDOM()) return 'desktop';
  // Unit 0–6 use this thin verification entry. Unit 7 removes the gate after
  // physical-device acceptance; an explicit release flag permits staged QA.
  if (phoneValidationEnabled && requestedPhoneValidationMode()) return 'phone';
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
  const phoneValidationMode = phoneValidationEnabled
    ? requestedPhoneValidationMode()
    : undefined;
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
  if (shellFamily === 'phone') {
    return (
      <PhoneStoryErrorBoundary>
        <Suspense fallback={<main className="route-loading">正在加载故事…</main>}>
          <PhoneStoryShell
            {...(phoneValidationMode
              ? { validationMode: phoneValidationMode }
              : {})}
          />
        </Suspense>
      </PhoneStoryErrorBoundary>
    );
  }
  return (
    <Suspense fallback={<main className="route-loading">正在加载故事…</main>}>
      <DesktopStoryShell />
    </Suspense>
  );
}
