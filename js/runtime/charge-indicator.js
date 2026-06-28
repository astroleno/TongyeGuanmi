/**
 * Snap Charge Indicator
 * Visual feedback for snap-triggered transitions
 */

export function createChargeIndicator({ container }) {
  const indicator = document.createElement('div');
  indicator.className = 'snap-charge-indicator';
  indicator.innerHTML = `
    <div class="snap-charge-indicator__bar"></div>
    <div class="snap-charge-indicator__halo"></div>
    <div class="snap-charge-indicator__sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
  `;

  const bar = indicator.querySelector('.snap-charge-indicator__bar');
  const halo = indicator.querySelector('.snap-charge-indicator__halo');
  const liveRegion = indicator.querySelector('.snap-charge-indicator__sr-only');

  container.appendChild(indicator);

  let currentProgress = 0;
  let currentDirection = 1;
  let hasAnnounced50 = false;
  let hasAnnouncedTrigger = false;

  return {
    show() {
      indicator.classList.remove('is-fading-out');
      indicator.classList.add('is-visible');
      hasAnnounced50 = false;
      hasAnnouncedTrigger = false;
    },

    hide() {
      indicator.classList.remove('is-visible');
      indicator.classList.remove('is-fading-out');
      bar.style.width = '0%';
      halo.classList.remove('is-active');
      halo.style.left = '0';
      halo.style.bottom = '0';
      currentProgress = 0;
      hasAnnounced50 = false;
      hasAnnouncedTrigger = false;
      liveRegion.textContent = '';
    },

    updateProgress(progress) {
      currentProgress = Math.max(0, Math.min(1, progress));
      const percentage = currentProgress * 100;
      bar.style.width = `${percentage}%`;

      // Announce at 50% threshold
      if (currentProgress >= 0.5 && !hasAnnounced50) {
        hasAnnounced50 = true;
        liveRegion.textContent = 'Transition armed';
      }
    },

    updateDirection(direction) {
      currentDirection = direction;
      if (direction === -1) {
        bar.classList.add('is-reverse');
      } else {
        bar.classList.remove('is-reverse');
      }
    },

    updateOrigin(x, y) {
      halo.style.left = `${x}px`;
      halo.style.bottom = `${window.innerHeight - y}px`;

      // Activate halo when progress is significant
      if (currentProgress > 0.3) {
        halo.classList.add('is-active');
      } else {
        halo.classList.remove('is-active');
      }

      // Announce when transition triggers (near 100%)
      if (currentProgress >= 0.95 && !hasAnnouncedTrigger) {
        hasAnnouncedTrigger = true;
        liveRegion.textContent = 'Transition playing';
      }
    },

    fadeOut() {
      indicator.classList.add('is-fading-out');
      halo.classList.remove('is-active');

      // Announce completion
      liveRegion.textContent = 'Transition complete';

      // Clean up after fade
      setTimeout(() => {
        if (indicator.classList.contains('is-fading-out')) {
          this.hide();
        }
      }, 400);
    }
  };
}
