import type { ReactNode, Ref, RefObject } from 'react';
import './PhoneStageRail.css';

export type PhoneStageRailProps = Readonly<{
  railRef: RefObject<HTMLElement | null>;
  viewportRef: RefObject<HTMLElement | null>;
  stageRef: Ref<HTMLDivElement>;
  children: ReactNode;
}>;

/** Generic rail/stage geometry only; scene markup belongs to adapters. */
export function PhoneStageRail({
  railRef,
  viewportRef,
  stageRef,
  children
}: PhoneStageRailProps) {
  return (
    <>
      <section
        ref={railRef}
        className="portrait-scroll-spike__stage-rail"
        aria-hidden="true"
      />
      <section
        ref={viewportRef}
        className="portrait-scroll-spike__stage"
        aria-label="同野观幂移动端视觉叙事"
        data-portrait-stage-host="persistent"
      >
        <div ref={stageRef} className="portrait-scroll-spike__stage-canvas">
          {children}
        </div>
      </section>
    </>
  );
}
