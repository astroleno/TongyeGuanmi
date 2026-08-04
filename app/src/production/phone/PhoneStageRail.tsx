import type { ReactNode, Ref, RefObject } from 'react';
import './PhoneStageRail.css';

export type PhoneStageRailProps = Readonly<{
  railRef: RefObject<HTMLElement | null>;
  viewportRef: RefObject<HTMLElement | null>;
  /** Physical backing that expands with Safari's live visual viewport. */
  coverageRef: Ref<HTMLDivElement>;
  stageRef: Ref<HTMLDivElement>;
  children: ReactNode;
}>;

/**
 * Effects may only escape the content stacking context through this direct
 * route sibling. A nested or unrelated overlay is deliberately not accepted.
 */
export function phoneRouteOverlayHostFor(
  contentHost: HTMLElement | null
): HTMLElement | null {
  return contentHost?.parentElement?.nextElementSibling as HTMLElement | null;
}

/** Generic rail/stage geometry only; scene markup belongs to adapters. */
export function PhoneStageRail({
  railRef,
  viewportRef,
  coverageRef,
  stageRef,
  children
}: PhoneStageRailProps) {
  return (
    <section ref={railRef} className="portrait-scroll-spike__stage-rail">
      <div
        ref={coverageRef}
        className="portrait-scroll-spike__viewport-coverage"
        data-phone-presentation-host="coverage"
        aria-hidden="true"
      />
      <section
        ref={viewportRef}
        className="portrait-scroll-spike__stage"
        aria-label="同野观幂移动端视觉叙事"
        data-portrait-stage-host="persistent"
      >
        <div
          ref={stageRef}
          className="portrait-scroll-spike__stage-canvas"
          data-phone-presentation-host="content"
        >
          {children}
        </div>
      </section>
      <div
        className="portrait-scroll-spike__route-overlay"
        data-phone-presentation-host="route-overlay"
        aria-hidden="true"
      />
    </section>
  );
}
