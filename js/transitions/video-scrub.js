const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);

export function prepareScrubVideo(video, { source = null, load = true } = {}) {
  if (!video) return null;

  if (source && video.getAttribute('src') !== source) {
    video.setAttribute('src', source);
  }

  video.muted = true;
  video.loop = false;
  video.autoplay = false;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.pause();

  if (load && video.readyState < 1) video.load();
  return video;
}

export function waitForVideoMetadata(video, { timeoutMs = 1200 } = {}) {
  if (!video || video.readyState >= 1) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener('loadedmetadata', finish);
      video.removeEventListener('canplay', finish);
      video.removeEventListener('error', finish);
      resolve();
    };

    const timer = window.setTimeout(finish, timeoutMs);
    video.addEventListener('loadedmetadata', finish, { once: true });
    video.addEventListener('canplay', finish, { once: true });
    video.addEventListener('error', finish, { once: true });
    video.load();
  });
}

export function getVideoDuration(video, { fallbackSeconds = 1 } = {}) {
  return Number.isFinite(video?.duration) && video.duration > 0 ? video.duration : fallbackSeconds;
}

export function seekVideoToProgress(video, progress, {
  fallbackSeconds = 1,
  endPaddingSeconds = 0.02,
  minDeltaSeconds = 0.016
} = {}) {
  if (!video || video.readyState < 1) return false;

  const duration = getVideoDuration(video, { fallbackSeconds });
  const safeProgress = clamp(progress);
  const maxTime = Math.max(0, duration - endPaddingSeconds);
  const targetTime = Math.min(maxTime, Math.max(0, safeProgress * duration));

  if (Math.abs(video.currentTime - targetTime) < minDeltaSeconds) return false;

  try {
    video.currentTime = targetTime;
    return true;
  } catch {
    return false;
  }
}
