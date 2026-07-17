import {
  HEVC_ALPHA_SOURCE_TYPE,
  WEBM_ALPHA_SOURCE_TYPE,
  isIOSFamilyNavigator,
  orderedAlphaVideoSources
} from './alpha-video-sources';

describe('alpha video sources', () => {
  it('recognizes iPhone, iPad, iPod, and desktop-mode iPadOS navigators', () => {
    expect(isIOSFamilyNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/138.0 Mobile/15E148 Safari/604.1'
    })).toBe(true);
    expect(isIOSFamilyNavigator({
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1'
    })).toBe(true);
    expect(isIOSFamilyNavigator({
      userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_7 like Mac OS X)',
      platform: 'iPod'
    })).toBe(true);
    expect(isIOSFamilyNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5
    })).toBe(true);
  });

  it('does not redirect desktop or Android browsers away from VP9 alpha', () => {
    expect(isIOSFamilyNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/138.0 Safari/537.36',
      platform: 'MacIntel',
      maxTouchPoints: 0
    })).toBe(false);
    expect(isIOSFamilyNavigator({
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/138.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5
    })).toBe(false);
  });

  it('puts HEVC alpha first on iOS while retaining WebM fallback', () => {
    expect(orderedAlphaVideoSources('/figure.webm', '/figure.mp4', true)).toEqual([
      {
        format: 'hevc',
        src: '/figure.mp4',
        type: HEVC_ALPHA_SOURCE_TYPE
      },
      {
        format: 'webm',
        src: '/figure.webm',
        type: WEBM_ALPHA_SOURCE_TYPE
      }
    ]);
  });

  it('keeps WebM first elsewhere while retaining HEVC fallback', () => {
    expect(orderedAlphaVideoSources('/figure.webm', '/figure.mp4', false)).toEqual([
      {
        format: 'webm',
        src: '/figure.webm',
        type: WEBM_ALPHA_SOURCE_TYPE
      },
      {
        format: 'hevc',
        src: '/figure.mp4',
        type: HEVC_ALPHA_SOURCE_TYPE
      }
    ]);
  });
});
