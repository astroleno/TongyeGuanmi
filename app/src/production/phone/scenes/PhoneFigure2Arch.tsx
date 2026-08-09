import { useLayoutEffect, useRef } from 'react';
import { RetainedFigure2Arch } from '../../../stage/RetainedFigure2Arch';
import { phoneMediaUrlFor } from '../phone-media';

const PHONE_FIGURE2_FOREGROUND_ARCH = phoneMediaUrlFor(
  'figure2-foreground-arch',
  'figure2-animation'
);

export async function preparePhoneFigure2ArchImage(
  image: HTMLImageElement,
  signal: AbortSignal
): Promise<boolean> {
  try {
    await image.decode();
  } catch {
    // Safari may reject decode for an already usable cached image.
  }
  return !signal.aborted && image.complete && image.naturalWidth > 0;
}

/** One token-bounded phone-stage owner for the Figure2 → Proof window. */
export function PhoneFigure2Arch({
  mounted,
  onReady
}: Readonly<{
  mounted: boolean;
  onReady?: () => void;
}>) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  useLayoutEffect(() => {
    const image = imageRef.current;
    if (!mounted || !image) return;
    const controller = new AbortController();
    void preparePhoneFigure2ArchImage(image, controller.signal).then((ready) => {
      if (ready) onReady?.();
    });
    return () => controller.abort();
  }, [mounted, onReady]);

  if (!mounted) return null;
  return (
    <RetainedFigure2Arch
      mounted
      visible
      src={PHONE_FIGURE2_FOREGROUND_ARCH}
      className="phone-grade-a__foreground-arch"
      motion="fixed"
      imageRef={imageRef}
    />
  );
}
