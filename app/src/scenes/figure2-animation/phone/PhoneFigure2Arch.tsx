import { phoneMediaUrlFor } from '../../../media/phone-media';
import { RetainedFigure2Arch } from '../../../stage/RetainedFigure2Arch';

const PHONE_FIGURE2_FOREGROUND_ARCH = phoneMediaUrlFor(
  'figure2-foreground-arch', 'figure2-animation'
);

/** One retained foreground arch, outside the depth-ranked field. */
export function PhoneFigure2Arch() {
  return (
    <RetainedFigure2Arch
      mounted
      visible
      src={PHONE_FIGURE2_FOREGROUND_ARCH}
      className="phone-grade-a__foreground-arch"
      motion="fixed"
    />
  );
}
