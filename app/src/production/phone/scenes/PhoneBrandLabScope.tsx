import { lazy, Suspense, useLayoutEffect } from 'react';
import '../PhoneStoryShell.css';

const PhoneBrandLabStory = lazy(() => import('../PhoneBrandLabStory').then((module) => ({
  default: module.PhoneBrandLabStory
})));

export function PhoneBrandLabScope({
  validationMode
}: Readonly<{
  validationMode?: string | undefined;
}>) {
  useLayoutEffect(() => {
    document.getElementById('story-loader-static')?.remove();
  }, []);
  const reducedMotion = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('portrait-spike-motion') === 'reduce';
  return (
    <Suspense fallback={<main className="route-loading">正在准备 Brand → Lab…</main>}>
      <PhoneBrandLabStory reducedMotion={reducedMotion} validationMode={validationMode} />
    </Suspense>
  );
}
