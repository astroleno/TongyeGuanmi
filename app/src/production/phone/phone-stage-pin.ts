import { useLayoutEffect } from 'react';
import type { PhoneStagePinMode } from './types';

export type PhoneValidationMode = 'v16' | 'v17' | 'v18' | 'v19' | 'v20' | 'v21' | 'v22' | 'v23' | 'v24' | 'v25' | 'v26' | 'v27' | 'v28' | 'v29' | 'v30' | 'v31' | 'v32' | 'v33' | 'v34' | 'v35' | 'v36' | 'v37' | 'v38' | 'v39' | 'v40' | 'v42' | 'v43' | 'v44' | 'v45' | 'v46' | 'v47';

export type PhoneStoryShellProps = Readonly<{
  /** Short numbered routes remain physical-device comparison entries. */
  validationMode?: PhoneValidationMode;
}>;

export function phoneStagePinMode(
  validationMode?: PhoneValidationMode
): PhoneStagePinMode {
  return validationMode === 'v47' ? 'transform' : 'native-fixed';
}

export function phoneStageAnimation(mode: PhoneStagePinMode): string {
  return mode === 'transform'
    ? 'gsap-scrolltrigger-transform-stage'
    : 'gsap-scrolltrigger-native-fixed-stage';
}

export function usePhoneStagePinMode(
  validationMode?: PhoneValidationMode
): PhoneStagePinMode {
  const mode = phoneStagePinMode(validationMode);
  useLayoutEffect(() => {
    if (mode !== 'transform') return;
    const documentElement = document.documentElement;
    documentElement.dataset.portraitStagePin = 'transform';
    return () => {
      if (documentElement.dataset.portraitStagePin === 'transform') {
        delete documentElement.dataset.portraitStagePin;
      }
    };
  }, [mode]);
  return mode;
}
