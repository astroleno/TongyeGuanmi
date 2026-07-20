import type { ReactNode, RefObject } from 'react';

export type PhoneStageRailProps = Readonly<{
  railRef: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}>;

/** Generic rail/stage geometry only; scene markup belongs to adapters. */
export function PhoneStageRail({ railRef, stageRef, children }: PhoneStageRailProps) {
  return (
    <section ref={railRef} className="portrait-scroll-spike__stage-rail">
      <section
        ref={stageRef}
        className="portrait-scroll-spike__stage"
        aria-label="同野观幂移动端视觉叙事"
      >
        {children}
      </section>
    </section>
  );
}
