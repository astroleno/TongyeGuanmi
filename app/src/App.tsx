import {
  Component,
  lazy,
  Suspense,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode
} from 'react';
import { canUseDOM } from './runtime/browser-guard';
import {
  initialPresentationFamily,
  type PresentationFamily
} from './production/presentation-profile';
import type { PhoneChunkRecoveryController } from './production/presentation-shell-loaders';
import './styles.css';

const harnessEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_HARNESS === '1';
const HarnessRouter = harnessEnabled
  ? lazy(() => import('./harness/HarnessRouter').then(({ HarnessRouter: Router }) => ({
      default: Router
    })))
  : null;
const DesktopStoryShell = lazy(() => import(
  './production/desktop/DesktopStoryShell'
).then(({ DesktopStoryShell: Shell }) => ({ default: Shell })));
const PhoneStoryShell = lazy(async () => {
  const { loadPhoneStoryShell } = await import(
    './production/presentation-shell-loaders'
  );
  return loadPhoneStoryShell();
});
const PhoneBrandLabStory = lazy(async () => {
  const { loadPhoneBrandLabStory } = await import(
    './production/presentation-shell-loaders'
  );
  return loadPhoneBrandLabStory();
});

export type AppRoute = 'formal' | 'brand-lab' | 'harness' | 'not-found';

export function appRouteForPath(pathname: string, allowHarness: boolean): AppRoute {
  if (pathname === '/' || pathname === '/index.html') return 'formal';
  if (pathname === '/brand-lab') return 'brand-lab';
  if (pathname.startsWith('/harness/') && allowHarness) return 'harness';
  return 'not-found';
}

function initialShellFamily(): PresentationFamily {
  return canUseDOM() ? initialPresentationFamily() : 'desktop';
}

function NotFound() {
  useLayoutEffect(() => {
    document.getElementById('story-loader-static')?.remove();
  }, []);
  return (
    <main className="route-not-found">
      <p>404</p>
      <h1>页面不存在</h1>
      <a href="/">返回同野观幂</a>
    </main>
  );
}

function PhoneBootstrapUnavailable() {
  useLayoutEffect(() => {
    document.getElementById('story-loader-static')?.remove();
  }, []);
  return (
    <main className="route-phone-recovery" role="alert" data-phone-bootstrap="fail-closed">
      <h1>手机故事暂时无法加载</h1>
      <p>启动恢复边界不可用，请手动重新加载。</p>
      <button type="button" onClick={() => window.location.reload()}>重新加载</button>
      <a href="/">返回首页</a>
    </main>
  );
}

export type PhoneAppChunkRecovery = Pick<PhoneChunkRecoveryController,
  'port' | 'getSnapshot' | 'subscribe' | 'reportPhoneCoreRejection' | 'manualReload'>;

export function PhoneRecoverySurface({
  recovery,
  failed
}: Readonly<{ recovery: PhoneAppChunkRecovery; failed: boolean }>) {
  const snapshot = useSyncExternalStore(
    recovery.subscribe,
    recovery.getSnapshot,
    recovery.getSnapshot
  );
  const failClosed = failed && snapshot.status === 'fail-closed';
  useLayoutEffect(() => {
    if (failClosed) document.getElementById('story-loader-static')?.remove();
  }, [failClosed]);
  if (!failClosed) {
    return <main className="route-loading" data-phone-bootstrap={snapshot.status} aria-busy="true" />;
  }
  return (
    <main className="route-phone-recovery" role="alert" data-phone-bootstrap="fail-closed">
      <h1>手机故事暂时无法加载</h1>
      <p>{snapshot.message}</p>
      <button type="button" onClick={() => recovery.manualReload()}>重新加载</button>
      <a href="/">返回首页</a>
    </main>
  );
}

type PhoneLazyBoundaryProps = Readonly<{
  recovery: PhoneAppChunkRecovery;
  routeKey: string;
  children: ReactNode;
}>;

class PhoneLazyBoundary extends Component<
  PhoneLazyBoundaryProps,
  Readonly<{ error: unknown | null; routeKey: string }>
> {
  state = { error: null, routeKey: this.props.routeKey };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  static getDerivedStateFromProps(
    props: PhoneLazyBoundaryProps,
    state: Readonly<{ error: unknown | null; routeKey: string }>
  ) {
    return props.routeKey === state.routeKey
      ? null
      : { error: null, routeKey: props.routeKey };
  }

  componentDidCatch(error: unknown): void {
    void this.props.recovery.reportPhoneCoreRejection(error);
  }

  render(): ReactNode {
    return this.state.error
      ? <PhoneRecoverySurface recovery={this.props.recovery} failed />
      : this.props.children;
  }
}

export function App({ chunkRecovery }: Readonly<{
  chunkRecovery: PhoneAppChunkRecovery | null;
}>) {
  const path = canUseDOM() ? window.location.pathname : '/';
  const route = appRouteForPath(path, harnessEnabled);
  const [shellFamily] = useState(initialShellFamily);
  if (route === 'harness') {
    if (!HarnessRouter) return <NotFound />;
    return (
      <Suspense fallback={<main className="route-loading">Loading harness…</main>}>
        <HarnessRouter path={path} />
      </Suspense>
    );
  }
  if (route === 'not-found') return <NotFound />;
  if (route === 'formal' && shellFamily === 'desktop') {
    return (
      <Suspense fallback={<main className="route-loading">正在加载故事…</main>}>
        <DesktopStoryShell />
      </Suspense>
    );
  }
  if (!chunkRecovery) return <PhoneBootstrapUnavailable />;
  return (
    <PhoneLazyBoundary recovery={chunkRecovery} routeKey={route}>
      <Suspense fallback={<PhoneRecoverySurface recovery={chunkRecovery} failed={false} />}>
        {route === 'brand-lab'
          ? <PhoneBrandLabStory chunkRecovery={chunkRecovery.port} />
          : <PhoneStoryShell diagnostics chunkRecovery={chunkRecovery.port} />}
      </Suspense>
    </PhoneLazyBoundary>
  );
}
