import type { Page } from '@playwright/test';

export type EndpointVisualSnapshot = Readonly<{
  scene: string;
  role: string;
  layerOpacity: number;
  handoffProgress: number | null;
  transitionAttrs: readonly string[];
  visual: Readonly<{
    rootRect: readonly number[];
    copyRect: readonly number[];
    lineBoxes: readonly Readonly<{ text: string; rects: readonly (readonly number[])[] }>[];
    typography: readonly Readonly<{
      text: string;
      fontFamily: string;
      fontSize: string;
      fontWeight: string;
      lineHeight: string;
      letterSpacing: string;
      textAlign: string;
    }>[];
    rootStyle: Readonly<{
      opacity: string;
      transform: string;
      color: string;
      backgroundColor: string;
      backgroundImage: string;
      colorScheme: string;
    }>;
    layerStyle: Readonly<{
      transform: string;
      clipPath: string;
      backgroundColor: string;
      backgroundImage: string;
    }>;
    scrollTop: number;
  }>;
}>;

export type EndpointProbe = Readonly<{
  near: EndpointVisualSnapshot | null;
  endpoint: EndpointVisualSnapshot | null;
}>;

type ProbeWindow = Window & {
  __r5EndpointProbe?: EndpointProbe;
  __r5CaptureEndpoint?: () => EndpointVisualSnapshot;
};

export async function installEndpointProbe(
  page: Page,
  targetScene: string,
  copySelector: string
): Promise<void> {
  await page.evaluate(({ scene, selector }) => {
    const rounded = (value: number) => Math.round(value * 1_000) / 1_000;
    const rectValues = (rect: DOMRect) => [
      rect.x,
      rect.y,
      rect.width,
      rect.height
    ].map(rounded);
    const capture = (): EndpointVisualSnapshot => {
      const layer = document.querySelector<HTMLElement>(`[data-stage-layer="${scene}"]`);
      const root = layer?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"]`);
      const copy = root?.matches(selector) ? root : root?.querySelector<HTMLElement>(selector) ?? root;
      if (!layer || !root || !copy) {
        throw new Error(`Endpoint probe target unavailable: ${scene}`);
      }
      const textElements = [...copy.querySelectorAll<HTMLElement>('span, h1, h2, h3, p, li, dt, dd')]
        .filter((element) => element.children.length === 0 && Boolean(element.textContent?.trim()));
      const lineBoxes = textElements.map((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const rects = [...range.getClientRects()].map((rect) => rectValues(rect));
        range.detach();
        return { text: element.textContent?.trim() ?? '', rects };
      });
      const typography = textElements.map((element) => {
        const style = getComputedStyle(element);
        return {
          text: element.textContent?.trim() ?? '',
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing,
          textAlign: style.textAlign
        };
      });
      const rootStyle = getComputedStyle(root);
      const layerStyle = getComputedStyle(layer);
      const scrollport = root.matches('[data-reading-scrollport="true"]')
        ? root
        : root.querySelector<HTMLElement>('[data-reading-scrollport="true"]')
          ?? (layer.dataset.reading === 'true' ? layer : null);
      return {
        scene,
        role: layer.dataset.role ?? '',
        layerOpacity: rounded(Number.parseFloat(layerStyle.opacity)),
        handoffProgress: layer.dataset.r4HandoffProgress
          ? Number.parseFloat(layer.dataset.r4HandoffProgress)
          : null,
        transitionAttrs: [
          layer.dataset.r4Handoff ?? '',
          layer.dataset.r4HandoffSegment ?? '',
          root.dataset.r4Transition ?? ''
        ].filter(Boolean),
        visual: {
          rootRect: rectValues(root.getBoundingClientRect()),
          copyRect: rectValues(copy.getBoundingClientRect()),
          lineBoxes,
          typography,
          rootStyle: {
            opacity: rootStyle.opacity,
            transform: rootStyle.transform,
            color: rootStyle.color,
            backgroundColor: rootStyle.backgroundColor,
            backgroundImage: rootStyle.backgroundImage,
            colorScheme: rootStyle.colorScheme
          },
          layerStyle: {
            transform: layerStyle.transform,
            clipPath: layerStyle.clipPath,
            backgroundColor: layerStyle.backgroundColor,
            backgroundImage: layerStyle.backgroundImage
          },
          scrollTop: rounded(scrollport?.scrollTop ?? 0)
        }
      };
    };

    const probeWindow = window as ProbeWindow;
    probeWindow.__r5EndpointProbe = { near: null, endpoint: null };
    probeWindow.__r5CaptureEndpoint = capture;
    let lastPreEndpoint: EndpointVisualSnapshot | null = null;
    const observer = new MutationObserver(() => {
      const layer = document.querySelector<HTMLElement>(`[data-stage-layer="${scene}"]`);
      if (!layer) return;
      const progress = Number.parseFloat(layer.dataset.r4HandoffProgress ?? '0');
      const opacity = Number.parseFloat(getComputedStyle(layer).opacity);
      const probe = probeWindow.__r5EndpointProbe ?? { near: null, endpoint: null };
      if (progress > 0 && progress < 0.999) {
        lastPreEndpoint = capture();
      }
      if (progress >= 0.98 && progress < 0.999) {
        probeWindow.__r5EndpointProbe = { ...probe, near: lastPreEndpoint };
        return;
      }
      const near = probe.near ?? lastPreEndpoint;
      if (!probe.endpoint && near && opacity >= 0.999) {
        probeWindow.__r5EndpointProbe = {
          ...(probeWindow.__r5EndpointProbe ?? probe),
          near,
          endpoint: capture()
        };
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: [
        'style',
        'data-role',
        'data-visible',
        'data-r4-handoff',
        'data-r4-handoff-progress'
      ]
    });
  }, { scene: targetScene, selector: copySelector });
}

export async function endpointProbe(page: Page): Promise<EndpointProbe> {
  return page.evaluate(() => (window as ProbeWindow).__r5EndpointProbe ?? {
    near: null,
    endpoint: null
  });
}

export async function captureSettledEndpoint(page: Page): Promise<EndpointVisualSnapshot> {
  return page.evaluate(() => {
    const capture = (window as ProbeWindow).__r5CaptureEndpoint;
    if (!capture) throw new Error('Endpoint capture is not installed');
    return capture();
  });
}
