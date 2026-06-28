/**
 * @fileoverview Ink Transition Factory - Unified factory for 4 ink transition types
 *
 * Implements Phase 2.5 requirement: single factory covering all 4 ink types with texture compositing
 *
 * Transition types:
 * - radial-center: center radial expansion (hero -> pattern-bloom)
 * - radial-rotating-left: left-side rotating radial expansion (pattern-bloom -> belief-star)
 * - horizontal-irregular: bottom-up / top-down horizontal irregular ink (7+ instances)
 * - sunburst-radial: radial expansion from PH background sun hotspot (lab -> ph)
 *
 * Implementation approach:
 * - Extends createInkSceneTransition with uSweepMode uniform (0=radial, 1=horizontal)
 * - Migrates curtain's sweepY + fbm field geometry into scene transition's threshold path
 * - All types support texture compositing via uNextScene sampler
 * - Sunburst uses runtime-calculated screen UV from PH background's coverUv mapping
 */

import { createInkSceneTransition } from './ink-scene-transition.js';

// ============================================================================
// Ink Type Configurations
// ============================================================================

/**
 * Preset configurations for each ink transition type
 */
const INK_TYPE_PRESETS = {
  'radial-center': {
    sweepMode: 0, // radial
    inkCenterX: 0.5,
    inkCenterY: 0.5,
    progressSpan: 1.16,
    colorLift: 0.32,
    depthThresholdMode: false,
    transparentOutside: false
  },

  'radial-rotating-left': {
    sweepMode: 0, // radial
    inkCenterX: 0.15,
    inkCenterY: 0.5,
    progressSpan: 1.16,
    colorLift: 0.38,
    depthThresholdMode: false,
    transparentOutside: false
  },

  'horizontal-irregular': {
    sweepMode: 1, // horizontal
    inkCenterX: 0.5,
    inkCenterY: 0.54,
    progressSpan: 1.16,
    colorLift: 0.28,
    depthThresholdMode: true, // Use threshold-based sweep for irregular horizontal
    transparentOutside: false
  },

  'sunburst-radial': {
    sweepMode: 0, // radial
    // inkCenterX/Y set dynamically from PH background coverUv mapping
    inkCenterX: 0.0977, // Source UV from ph_background.png (200/2048)
    inkCenterY: 0.6476, // Source UV from ph_background.png (746/1152)
    progressSpan: 1.16,
    colorLift: 0.42,
    depthThresholdMode: false,
    transparentOutside: false,
    requiresCoverUvMapping: true // Flag for runtime UV calculation
  }
};

/**
 * Direction presets for horizontal-irregular transitions
 */
const HORIZONTAL_DIRECTIONS = {
  'bottom-up': 0, // uDirection = 0 (default)
  'top-down': 1   // uDirection = 1
};

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create ink transition instance based on type
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {Object} options - Transition configuration
 * @param {string} options.type - Ink type: 'radial-center' | 'radial-rotating-left' | 'horizontal-irregular' | 'sunburst-radial'
 * @param {string} options.direction - For horizontal-irregular: 'bottom-up' | 'top-down'
 * @param {Object} options.assets - Asset paths for depth maps and target scene
 * @param {string} options.targetSrc - Target scene image source
 * @param {HTMLElement} options.nextSceneElement - Target scene element for texture projection
 * @param {HTMLElement} options.sourceElement - Source element for bounds calculation
 * @param {HTMLElement} options.figureMaskElement - Optional figure mask element
 * @param {boolean} options.farOnly - Use far depth only (no near depth layer)
 * @param {boolean} options.hideAtEnd - Hide canvas at end of transition
 * @param {number} options.colorLift - Color lift factor (0-1)
 * @param {number} options.imageScale - Image scale factor
 * @param {number} options.imageCenterX - Image center X (0-1)
 * @param {number} options.imageCenterY - Image center Y (0-1)
 * @param {boolean} options.perlinOverlay - Enable perlin noise overlay
 * @param {number} options.perlinStrength - Perlin overlay strength
 * @param {number} options.sceneBrightness - Scene brightness multiplier
 * @param {Function} options.calculateCoverUv - Optional function to calculate screen UV from source UV (for sunburst)
 * @returns {Object|null} Transition instance with render/prewarm methods
 */
export function createInkTransition(canvas, options = {}) {
  if (!canvas) {
    console.error('[InkTransitionFactory] Canvas is required');
    return null;
  }

  const { type = 'radial-center', direction = 'bottom-up' } = options;

  // Validate ink type
  if (!INK_TYPE_PRESETS[type]) {
    console.error(`[InkTransitionFactory] Unknown ink type: ${type}`);
    return null;
  }

  // Get preset configuration
  const preset = INK_TYPE_PRESETS[type];

  // Build merged options
  const mergedOptions = {
    ...options,
    ...preset,
    // Override with explicit options if provided
    colorLift: options.colorLift !== undefined ? options.colorLift : preset.colorLift,
    progressSpan: options.progressSpan !== undefined ? options.progressSpan : preset.progressSpan
  };

  // Handle sunburst UV mapping
  if (type === 'sunburst-radial' && options.calculateCoverUv) {
    // Calculate screen UV from source UV using PH background's cover mapping
    const screenUv = options.calculateCoverUv(preset.inkCenterX, preset.inkCenterY);
    mergedOptions.inkCenterX = screenUv.x;
    mergedOptions.inkCenterY = screenUv.y;
  }

  // Handle horizontal direction
  if (type === 'horizontal-irregular') {
    const directionValue = HORIZONTAL_DIRECTIONS[direction];
    if (directionValue === undefined) {
      console.warn(`[InkTransitionFactory] Unknown direction: ${direction}, defaulting to bottom-up`);
      mergedOptions.direction = 0;
    } else {
      mergedOptions.direction = directionValue;
    }
  }

  // Create underlying scene transition with merged options
  const transition = createInkSceneTransition(canvas, mergedOptions);

  if (!transition) {
    console.error('[InkTransitionFactory] Failed to create ink scene transition');
    return null;
  }

  // Return wrapped API with type metadata
  return Object.freeze({
    /**
     * Render transition frame
     * @param {number} progress - Progress value (0-1)
     * @param {number} pointerX - Pointer X position in pixels
     * @param {number} pointerY - Pointer Y position in pixels
     * @param {number} visibilityProgress - Visibility progress (0-1)
     * @param {Object} renderOptions - Additional render options
     */
    render(progress, pointerX = 0, pointerY = 0, visibilityProgress = progress, renderOptions = {}) {
      return transition.render(progress, pointerX, pointerY, visibilityProgress, renderOptions);
    },

    /**
     * Prewarm shader (compile and render first frame)
     */
    prewarm() {
      return transition.prewarm();
    },

    /**
     * Get transition type
     * @returns {string}
     */
    getType() {
      return type;
    },

    /**
     * Get direction (for horizontal-irregular only)
     * @returns {string|null}
     */
    getDirection() {
      return type === 'horizontal-irregular' ? direction : null;
    },

    /**
     * Update ink center dynamically (for sunburst after resize)
     * @param {number} x - Center X (0-1)
     * @param {number} y - Center Y (0-1)
     */
    updateInkCenter(x, y) {
      mergedOptions.inkCenterX = x;
      mergedOptions.inkCenterY = y;
    }
  });
}

/**
 * Calculate cover UV mapping for sunburst transitions
 * Converts source image UV to screen UV using object-fit: cover logic
 * @param {number} sourceUvX - Source UV X (0-1)
 * @param {number} sourceUvY - Source UV Y (0-1)
 * @param {number} sourceWidth - Source image width
 * @param {number} sourceHeight - Source image height
 * @param {number} screenWidth - Screen/canvas width
 * @param {number} screenHeight - Screen/canvas height
 * @returns {{x: number, y: number}} Screen UV coordinates
 */
export function calculateCoverUv(sourceUvX, sourceUvY, sourceWidth, sourceHeight, screenWidth, screenHeight) {
  const sourceAspect = sourceWidth / Math.max(sourceHeight, 1);
  const screenAspect = screenWidth / Math.max(screenHeight, 1);

  let screenX = sourceUvX;
  let screenY = sourceUvY;

  if (screenAspect > sourceAspect) {
    // Screen wider than source - scale height
    const scale = screenAspect / sourceAspect;
    screenY = (sourceUvY - 0.5) / scale + 0.5;
  } else {
    // Screen taller than source - scale width
    const scale = sourceAspect / screenAspect;
    screenX = (sourceUvX - 0.5) / scale + 0.5;
  }

  return {
    x: Math.max(0, Math.min(1, screenX)),
    y: Math.max(0, Math.min(1, screenY))
  };
}

/**
 * Get available ink types
 * @returns {string[]}
 */
export function getAvailableInkTypes() {
  return Object.keys(INK_TYPE_PRESETS);
}

/**
 * Get preset configuration for a specific type (for inspection/debugging)
 * @param {string} type - Ink type
 * @returns {Object|null}
 */
export function getInkTypePreset(type) {
  return INK_TYPE_PRESETS[type] || null;
}

// ============================================================================
// Convenience Factories
// ============================================================================

/**
 * Create radial center ink transition (hero -> pattern-bloom)
 */
export function createRadialCenterInk(canvas, options = {}) {
  return createInkTransition(canvas, { ...options, type: 'radial-center' });
}

/**
 * Create radial rotating left ink transition (pattern-bloom -> belief-star)
 */
export function createRadialRotatingLeftInk(canvas, options = {}) {
  return createInkTransition(canvas, { ...options, type: 'radial-rotating-left' });
}

/**
 * Create horizontal irregular ink transition (bottom-up or top-down)
 */
export function createHorizontalIrregularInk(canvas, options = {}) {
  return createInkTransition(canvas, { ...options, type: 'horizontal-irregular' });
}

/**
 * Create sunburst radial ink transition (lab -> ph)
 */
export function createSunburstRadialInk(canvas, options = {}) {
  return createInkTransition(canvas, { ...options, type: 'sunburst-radial' });
}
