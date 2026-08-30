import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';

type HarnessRoute = ComponentType;

const routeLoaders: Readonly<Record<string, () => Promise<{ default: HarnessRoute }>>> = {
  '/harness/machine': () => import('./MachineHarness').then(({ MachineHarness }) => ({ default: MachineHarness })),
  '/harness/devtools': () => import('./DevtoolsHarness').then(({ DevtoolsHarness }) => ({ default: DevtoolsHarness })),
  '/harness/stage': () => import('./StageHarness').then(({ StageHarness }) => ({ default: StageHarness })),
  '/harness/r5-phone-clean': () => import('./r5-phone-clean/PhoneCleanHarness').then(({ PhoneCleanHarness }) => ({ default: PhoneCleanHarness })),
  '/harness/frame-lock-spike': () => import('./frame-lock-spike/FrameLockSpikeHarness').then(({ FrameLockSpikeHarness }) => ({ default: FrameLockSpikeHarness })),
  '/harness/ph': () => import('./frame-lock-spike/FrameLockSpikeHarness').then(({ FrameLockSpikeHarness }) => ({ default: FrameLockSpikeHarness })),
  '/harness/crane': () => import('./frame-lock-spike/FrameLockSpikeHarness').then(({ FrameLockSpikeHarness }) => ({ default: FrameLockSpikeHarness })),
  '/harness/r3-pilot': () => import('./r3/PilotHarness').then(({ PilotHarness }) => ({ default: () => <PilotHarness mode="pilot" /> })),
  '/harness/aod-animation': () => import('./r3/PilotHarness').then(({ PilotHarness }) => ({ default: () => <PilotHarness mode="aod-animation" /> })),
  '/harness/star-map-aod': () => import('./r3/PilotHarness').then(({ PilotHarness }) => ({ default: () => <PilotHarness mode="star-map-aod" /> })),
  '/harness/aod-method-top': () => import('./r3/PilotHarness').then(({ PilotHarness }) => ({ default: () => <PilotHarness mode="aod-method-top" /> })),
  '/harness/r4-g1': () => import('./r4/Group1Harness').then(({ Group1Harness }) => ({ default: () => <Group1Harness mode="group1" /> })),
  '/harness/r4-g1-hero-pattern': () => import('./r4/Group1Harness').then(({ Group1Harness }) => ({ default: () => <Group1Harness mode="hero-pattern" /> })),
  '/harness/r4-g1-pattern-star-map': () => import('./r4/Group1Harness').then(({ Group1Harness }) => ({ default: () => <Group1Harness mode="pattern-star-map" /> })),
  '/harness/r4-g2': () => import('./r4/Group2Harness').then(({ Group2Harness }) => ({ default: () => <Group2Harness mode="group2" /> })),
  '/harness/r4-g2-method-bottom-figure2': () => import('./r4/Group2Harness').then(({ Group2Harness }) => ({ default: () => <Group2Harness mode="method-bottom-figure2" /> })),
  '/harness/r4-g3': () => import('./r4/Group3Harness').then(({ Group3Harness }) => ({ default: () => <Group3Harness mode="group3" /> })),
  '/harness/r4-g3-figure2-distance-expand': () => import('./r4/Group3Harness').then(({ Group3Harness }) => ({ default: () => <Group3Harness mode="figure2-distance-expand" /> })),
  '/harness/r4-g3-figure2-proof-brand': () => import('./r4/Group3Harness').then(({ Group3Harness }) => ({ default: () => <Group3Harness mode="figure2-proof-brand" /> })),
  '/harness/r4-g4': () => import('./r4/Group4Harness').then(({ Group4Harness }) => ({ default: () => <Group4Harness mode="group4" /> })),
  '/harness/r4-g4-brand-figure3': () => import('./r4/Group4Harness').then(({ Group4Harness }) => ({ default: () => <Group4Harness mode="brand-figure3" /> })),
  '/harness/r4-g4-figure3-services': () => import('./r4/Group4Harness').then(({ Group4Harness }) => ({ default: () => <Group4Harness mode="figure3-services" /> })),
  '/harness/r4-g5': () => import('./r4/Group5Harness').then(({ Group5Harness }) => ({ default: () => <Group5Harness mode="group5" /> })),
  '/harness/r4-g5-services-ttg': () => import('./r4/Group5Harness').then(({ Group5Harness }) => ({ default: () => <Group5Harness mode="services-ttg" /> })),
  '/harness/r4-g5-ttg-lab': () => import('./r4/Group5Harness').then(({ Group5Harness }) => ({ default: () => <Group5Harness mode="ttg-lab" /> })),
  '/harness/r4-g6': () => import('./r4/Group6Harness').then(({ Group6Harness }) => ({ default: () => <Group6Harness mode="group6" /> })),
  '/harness/r4-g6-lab-ph': () => import('./r4/Group6Harness').then(({ Group6Harness }) => ({ default: () => <Group6Harness mode="lab-ph" /> })),
  '/harness/r4-g6-ph-education': () => import('./r4/Group6Harness').then(({ Group6Harness }) => ({ default: () => <Group6Harness mode="ph-education" /> })),
  '/harness/r4-g7': () => import('./r4/Group7Harness').then(({ Group7Harness }) => ({ default: () => <Group7Harness mode="group7" /> })),
  '/harness/r4-g7-education-crane': () => import('./r4/Group7Harness').then(({ Group7Harness }) => ({ default: () => <Group7Harness mode="education-crane" /> })),
  '/harness/r4-g7-crane-contact': () => import('./r4/Group7Harness').then(({ Group7Harness }) => ({ default: () => <Group7Harness mode="crane-contact" /> })),
  '/harness/r4-back-half': () => import('./r4/BackHalfHarness').then(({ BackHalfHarness }) => ({ default: BackHalfHarness }))
};

const routes = Object.fromEntries(
  Object.entries(routeLoaders).map(([path, loader]) => [path, lazy(loader)])
) as Readonly<Record<string, LazyExoticComponent<HarnessRoute>>>;

export function HarnessRouter({ path }: { path: string }) {
  const Route = routes[path];
  if (!Route) {
    return <main className="route-not-found"><h1>Harness not found</h1></main>;
  }
  return <Suspense fallback={<main className="route-loading">Loading harness…</main>}><Route /></Suspense>;
}
