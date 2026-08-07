import { useEffect, useRef } from 'react';
import { semanticBoolean } from '../runtime/semantic-data-attribute';

export const PHONE_FIGURE2_ARCH_SRC = new URL(
  '../../../assets/figure2-phone-foreground-arch.webp', import.meta.url
).href;

function reportDecodedArchFailure(
  image: HTMLImageElement,
  error: unknown,
  onFailure: (error: unknown) => void
): void {
  if (image.getAttribute('data-phone-figure2-arch-error') === 'decode') return;
  image.setAttribute('data-phone-figure2-arch-error', 'decode');
  onFailure(error);
}

/** Phone route copy of the canonical retained-arch presentation contract. */
function proveDecodedArch(
  image: HTMLImageElement,
  active: () => boolean,
  currentOwner: () => boolean,
  onReady: () => void,
  onFailure: (error: unknown) => void
): void {
  const markReady = () => {
    if (!active() || !currentOwner() || !image.isConnected) return;
    image.setAttribute('data-phone-figure2-arch-ready', 'true');
    onReady();
  };
  const markFailure = (error: unknown) => {
    if (active() && currentOwner()) reportDecodedArchFailure(image, error, onFailure);
  };
  if (typeof image.decode !== 'function') {
    markReady();
    return;
  }
  void image.decode().then(markReady, markFailure);
}

export function RetainedFigure2Arch({
  mounted,
  visible,
  src,
  motion = 'depth',
  ownerKey,
  onDecodeReady,
  onDecodeFailure
}: Readonly<{
  mounted: boolean;
  visible: boolean;
  src: string;
  motion?: 'depth' | 'fixed';
  ownerKey?: string | null;
  onDecodeReady: () => void;
  onDecodeFailure: (error: unknown) => void;
}>) {
  const activeRef = useRef(true);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const ownerKeyRef = useRef(ownerKey);
  ownerKeyRef.current = ownerKey;
  const readyRef = useRef(onDecodeReady);
  readyRef.current = onDecodeReady;
  const failureRef = useRef(onDecodeFailure);
  failureRef.current = onDecodeFailure;
  const readyOwnerRef = useRef<string | null>(null);
  const decodeOwnerRef = useRef<string | null>(null);
  const beginDecodeRef = useRef<(image: HTMLImageElement) => void>(() => undefined);
  beginDecodeRef.current = (image) => {
    const owner = ownerKeyRef.current;
    if (!owner || decodeOwnerRef.current === owner) return;
    decodeOwnerRef.current = owner;
    proveDecodedArch(
      image,
      () => activeRef.current,
      () => ownerKeyRef.current === owner,
      () => {
        if (readyOwnerRef.current === owner) return;
        readyOwnerRef.current = owner;
        readyRef.current();
      },
      (error) => failureRef.current(error)
    );
  };
  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);
  useEffect(() => {
    const image = imageRef.current;
    if (!ownerKey || !image) {
      decodeOwnerRef.current = null;
      readyOwnerRef.current = null;
      return;
    }
    image.removeAttribute('data-phone-figure2-arch-error');
    if (image.getAttribute('data-phone-figure2-arch-ready') === 'true') {
      if (readyOwnerRef.current !== ownerKey) {
        readyOwnerRef.current = ownerKey;
        readyRef.current();
      }
    }
    else beginDecodeRef.current(image);
  }, [ownerKey]);
  if (!mounted) return null;
  return (
    <img
      ref={imageRef}
      className="stage-proof-retained-arch"
      data-stage-retained-figure2-arch="true"
      data-figure2-arch-motion={motion}
      data-visible={semanticBoolean(visible)}
      data-phone-surface="figure2-foreground-arch"
      data-phone-figure2-arch-ready="false"
      src={src}
      onLoad={(event) => beginDecodeRef.current(event.currentTarget)}
      onError={(event) => {
        if (activeRef.current && ownerKeyRef.current) reportDecodedArchFailure(
          event.currentTarget,
          new Error('Figure2 retained arch failed to load'),
          (error) => failureRef.current(error)
        );
      }}
      alt=""
      aria-hidden="true"
    />
  );
}
