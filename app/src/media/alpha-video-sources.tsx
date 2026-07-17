import { Fragment } from 'react';

export const HEVC_ALPHA_SOURCE_TYPE = 'video/mp4; codecs="hvc1"';
export const WEBM_ALPHA_SOURCE_TYPE = 'video/webm; codecs="vp9"';

export type AlphaVideoNavigator = Readonly<{
  userAgent: string;
  platform?: string | undefined;
  maxTouchPoints?: number | undefined;
}>;

export type AlphaVideoSource = Readonly<{
  format: 'hevc' | 'webm';
  src: string;
  type: string;
}>;

export function isIOSFamilyNavigator(candidate: AlphaVideoNavigator | null | undefined): boolean {
  if (!candidate) {
    return false;
  }
  return /iPad|iPhone|iPod/i.test(candidate.userAgent)
    || (candidate.platform === 'MacIntel' && (candidate.maxTouchPoints ?? 0) > 1);
}

export function browserPrefersHevcAlpha(): boolean {
  return typeof navigator !== 'undefined' && isIOSFamilyNavigator(navigator);
}

export function orderedAlphaVideoSources(
  webm: string,
  hevc: string,
  preferHevc = browserPrefersHevcAlpha()
): readonly AlphaVideoSource[] {
  const webmSource = {
    format: 'webm' as const,
    src: webm,
    type: WEBM_ALPHA_SOURCE_TYPE
  };
  const hevcSource = {
    format: 'hevc' as const,
    src: hevc,
    type: HEVC_ALPHA_SOURCE_TYPE
  };
  return preferHevc
    ? [hevcSource, webmSource]
    : [webmSource, hevcSource];
}

export function AlphaVideoSources({
  webm,
  hevc
}: Readonly<{
  webm: string;
  hevc: string;
}>) {
  return (
    <>
      {orderedAlphaVideoSources(webm, hevc).map((source) => (
        <Fragment key={source.format}>
          <source
            src={source.src}
            type={source.type}
            data-alpha-video-format={source.format}
          />
        </Fragment>
      ))}
    </>
  );
}
