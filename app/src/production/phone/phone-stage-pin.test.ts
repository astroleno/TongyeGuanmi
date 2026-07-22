import { describe, expect, it } from 'vitest';
import {
  phoneStageAnimation,
  phoneStagePinMode
} from './phone-stage-pin';

describe('phone stage pin topology', () => {
  it('isolates the transform pin to the v47 physical-device candidate', () => {
    expect(phoneStagePinMode('v47')).toBe('transform');
    expect(phoneStagePinMode('v46')).toBe('native-fixed');
    expect(phoneStagePinMode()).toBe('native-fixed');
  });

  it('publishes an inspectable animation contract for each topology', () => {
    expect(phoneStageAnimation('transform')).toBe(
      'gsap-scrolltrigger-transform-stage'
    );
    expect(phoneStageAnimation('native-fixed')).toBe(
      'gsap-scrolltrigger-native-fixed-stage'
    );
  });
});
