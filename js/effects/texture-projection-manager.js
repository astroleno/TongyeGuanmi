/**
 * @fileoverview Texture Projection Manager - Manages texture sources for ink transitions
 *
 * Implements plan lines 432-443 (texture pipeline)
 *
 * Texture source types:
 * - asset: static images (PH background, etc) - wait for image.decode() + dimensions
 * - canvasProjection: render DOM to canvas for sampling - runtime canvas rendering
 * - liveElement: complex DOM (avoided in main path) - requires explicit adapter
 * - none: pure mask transition - no texture needed, commit switches DOM
 *
 * Ready conditions:
 * - asset: image.decode() complete + width/height > 0
 * - canvasProjection: canvas rendered, dataset.inkTextureReady="true", non-empty pixel sampling
 * - liveElement: only allowed with explicit adapter implementation, no default html2canvas
 * - none: no texture needed, commit() switches DOM directly
 *
 * Validation:
 * - Non-empty detection: sample 3×3 center region, at least 1 pixel with alpha > 0
 * - Timeout handling: textureReadyTimeoutMs (1200ms) → RecoverPresentTarget
 * - Failure never shows pure color/half-blank, must present terminal state
 */

// ============================================================================
// Configuration
// ============================================================================

const TEXTURE_CONFIG = {
  READY_TIMEOUT: 1200,           // Timeout for texture ready check (ms)
  VALIDATION_SAMPLE_SIZE: 3,     // Sample size for non-empty validation (3×3 grid)
  MIN_ALPHA_THRESHOLD: 0         // Minimum alpha value to consider non-empty (0 = any non-zero)
};

// ============================================================================
// Texture Type Handlers
// ============================================================================

/**
 * Handle asset texture (static image)
 * @param {HTMLImageElement} element
 * @returns {Promise<void>}
 */
async function prepareAssetTexture(element) {
  if (!(element instanceof HTMLImageElement)) {
    throw new Error('Asset texture must be HTMLImageElement');
  }

  // Wait for image decode
  if (element.decode) {
    await element.decode();
  }

  // Validate dimensions
  if (!element.naturalWidth || !element.naturalHeight) {
    throw new Error(`Asset texture has invalid dimensions: ${element.naturalWidth}×${element.naturalHeight}`);
  }

  // Mark ready
  if (element.dataset) {
    element.dataset.inkTextureReady = 'true';
  }
}

/**
 * Handle canvas projection texture (DOM → canvas rendering)
 * Canvas must be rendered by runtime, then marked ready
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<void>}
 */
async function prepareCanvasProjectionTexture(canvas) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Canvas projection texture must be HTMLCanvasElement');
  }

  // Canvas should already be rendered and marked ready by producer
  // This function validates readiness
  if (canvas.dataset?.inkTextureReady !== 'true') {
    throw new Error('Canvas projection texture not marked ready by producer');
  }

  // Validate non-empty
  if (!validateNonEmpty(canvas)) {
    throw new Error('Canvas projection texture is empty or blank');
  }
}

/**
 * Handle live element texture (complex DOM)
 * Only allowed with explicit adapter - no default html2canvas
 * @param {HTMLElement} element
 * @param {Function} adapter - Custom adapter function (element) => Promise<canvas>
 * @returns {Promise<HTMLCanvasElement>}
 */
async function prepareLiveElementTexture(element, adapter) {
  if (!adapter || typeof adapter !== 'function') {
    throw new Error('Live element texture requires explicit adapter function (no default html2canvas)');
  }

  // Call adapter to produce canvas
  const canvas = await adapter(element);

  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Live element adapter must return HTMLCanvasElement');
  }

  // Validate non-empty
  if (!validateNonEmpty(canvas)) {
    throw new Error('Live element texture produced empty canvas');
  }

  // Mark ready
  if (canvas.dataset) {
    canvas.dataset.inkTextureReady = 'true';
  }

  return canvas;
}

/**
 * Handle none texture (pure mask transition)
 * No texture needed - commit() will switch DOM directly
 * @returns {Promise<void>}
 */
async function prepareNoneTexture() {
  // No-op - no texture preparation needed
  return Promise.resolve();
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate canvas has non-empty pixels
 * Samples 3×3 center region, requires at least 1 pixel with alpha > 0
 * @param {HTMLCanvasElement} canvas
 * @returns {boolean}
 */
function validateNonEmpty(canvas) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return false;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return false;
  }

  const w = canvas.width;
  const h = canvas.height;

  if (w === 0 || h === 0) {
    return false;
  }

  // Sample 3×3 center region
  const sampleSize = TEXTURE_CONFIG.VALIDATION_SAMPLE_SIZE;
  const centerX = Math.floor(w / 2);
  const centerY = Math.floor(h / 2);
  const halfSize = Math.floor(sampleSize / 2);

  try {
    const imageData = ctx.getImageData(
      Math.max(0, centerX - halfSize),
      Math.max(0, centerY - halfSize),
      Math.min(sampleSize, w),
      Math.min(sampleSize, h)
    );

    const data = imageData.data;

    // Check if at least one pixel has alpha > threshold
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > TEXTURE_CONFIG.MIN_ALPHA_THRESHOLD) {
        return true;
      }
    }

    return false;
  } catch (e) {
    // Canvas may be tainted or not ready
    console.warn('[TextureProjectionManager] validateNonEmpty failed:', e);
    return false;
  }
}

/**
 * Wait for texture element to be ready
 * Polls for readiness markers and content validation
 * @param {HTMLElement} element
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
function waitForTextureReady(element, timeoutMs = TEXTURE_CONFIG.READY_TIMEOUT) {
  return new Promise((resolve, reject) => {
    if (!element) {
      reject(new Error('Texture element is null or undefined'));
      return;
    }

    const startTime = Date.now();
    const pollInterval = 50;

    function checkReady() {
      const elapsed = Date.now() - startTime;

      if (elapsed >= timeoutMs) {
        reject(new Error(`Texture ready timeout after ${timeoutMs}ms`));
        return;
      }

      // Check ready marker
      if (element.dataset?.inkTextureReady === 'true') {
        // For canvas, also validate non-empty
        if (element instanceof HTMLCanvasElement) {
          if (validateNonEmpty(element)) {
            resolve();
            return;
          }
          // Canvas marked ready but empty - continue polling
        } else {
          // Non-canvas element marked ready
          resolve();
          return;
        }
      }

      // Continue polling
      setTimeout(checkReady, pollInterval);
    }

    checkReady();
  });
}

// ============================================================================
// Canvas Projection Helpers
// ============================================================================

/**
 * Project simple text/element to canvas
 * For text and simple hierarchy (no complex layout)
 * @param {HTMLElement} element - Source element
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @returns {boolean} Success status
 */
function projectSimpleText(element, canvas) {
  if (!element || !canvas) {
    return false;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return false;
  }

  // Get element dimensions and style
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  // Set canvas size
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.ceil(rect.width * dpr);
  canvas.height = Math.ceil(rect.height * dpr);
  ctx.scale(dpr, dpr);

  // Clear canvas
  ctx.clearRect(0, 0, rect.width, rect.height);

  // Set text style
  ctx.font = style.font;
  ctx.fillStyle = style.color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Draw text content
  const text = element.textContent || '';
  const lines = text.split('\n');
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;

  let y = 0;
  for (const line of lines) {
    ctx.fillText(line, 0, y);
    y += lineHeight;
  }

  return true;
}

/**
 * Project card grid to canvas
 * For card grid layouts with uniform structure
 * @param {HTMLElement} element - Source element (grid container)
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @returns {boolean} Success status
 */
function projectCardGrid(element, canvas) {
  if (!element || !canvas) {
    return false;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return false;
  }

  // Get element dimensions
  const rect = element.getBoundingClientRect();

  // Set canvas size
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.ceil(rect.width * dpr);
  canvas.height = Math.ceil(rect.height * dpr);
  ctx.scale(dpr, dpr);

  // Clear canvas
  ctx.clearRect(0, 0, rect.width, rect.height);

  // Find card children
  const cards = element.querySelectorAll('[data-card], .card');

  if (cards.length === 0) {
    return false;
  }

  // Draw each card as a simple rectangle with text
  cards.forEach((card) => {
    const cardRect = card.getBoundingClientRect();
    const cardStyle = window.getComputedStyle(card);

    // Calculate position relative to container
    const x = cardRect.left - rect.left;
    const y = cardRect.top - rect.top;
    const w = cardRect.width;
    const h = cardRect.height;

    // Draw card background
    ctx.fillStyle = cardStyle.backgroundColor || '#ffffff';
    ctx.fillRect(x, y, w, h);

    // Draw card border if present
    const borderWidth = parseFloat(cardStyle.borderWidth) || 0;
    if (borderWidth > 0) {
      ctx.strokeStyle = cardStyle.borderColor || '#000000';
      ctx.lineWidth = borderWidth;
      ctx.strokeRect(x, y, w, h);
    }

    // Draw card text content
    const text = card.textContent || '';
    if (text.trim()) {
      ctx.fillStyle = cardStyle.color || '#000000';
      ctx.font = cardStyle.font || '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text.trim(), x + w / 2, y + h / 2);
    }
  });

  return true;
}

/**
 * Measure projection bounds for element
 * Calculates the bounding box for canvas projection
 * @param {HTMLElement} element
 * @returns {Object} Bounds { width, height, top, left }
 */
function measureProjectionBounds(element) {
  if (!element) {
    return { width: 0, height: 0, top: 0, left: 0 };
  }

  const rect = element.getBoundingClientRect();

  return {
    width: rect.width,
    height: rect.height,
    top: rect.top,
    left: rect.left
  };
}

// ============================================================================
// Manager Factory
// ============================================================================

/**
 * Create texture projection manager instance
 * @param {Object} options
 * @param {Object} options.recoveryHandler - Recovery handler instance (from recovery-handler.js)
 * @returns {Object} Texture projection manager API
 */
export function createTextureProjectionManager({ recoveryHandler } = {}) {
  /**
   * Prepare texture based on source type
   * @param {Object} block - Block configuration
   * @param {string} block.textureSource - Texture source type (asset|canvasProjection|liveElement|none)
   * @param {HTMLElement} block.textureElement - Texture element
   * @param {Function} block.liveElementAdapter - Optional adapter for liveElement type
   * @param {Object} targetScene - Target scene identifier
   * @returns {Promise<void>}
   */
  async function prepareTexture(block, targetScene) {
    if (!block) {
      throw new Error('Block configuration is required');
    }

    const { textureSource, textureElement, liveElementAdapter } = block;

    if (!textureSource) {
      throw new Error('textureSource is required in block configuration');
    }

    try {
      switch (textureSource) {
        case 'asset':
          if (!textureElement || !(textureElement instanceof HTMLImageElement)) {
            throw new Error('Asset texture requires HTMLImageElement');
          }
          await prepareAssetTexture(textureElement);
          break;

        case 'canvasProjection':
          if (!textureElement || !(textureElement instanceof HTMLCanvasElement)) {
            throw new Error('Canvas projection texture requires HTMLCanvasElement');
          }
          await prepareCanvasProjectionTexture(textureElement);
          break;

        case 'liveElement':
          if (!textureElement) {
            throw new Error('Live element texture requires element');
          }
          await prepareLiveElementTexture(textureElement, liveElementAdapter);
          break;

        case 'none':
          await prepareNoneTexture();
          break;

        default:
          throw new Error(`Unknown textureSource type: ${textureSource}`);
      }
    } catch (error) {
      // Texture preparation failed - trigger recovery if handler available
      if (recoveryHandler) {
        await recoveryHandler.handleRecovery(
          targetScene,
          'texture_preparation_failed',
          {
            textureSource,
            error: error.message,
            block: block.id || 'unknown'
          }
        );
      }
      throw error;
    }
  }

  /**
   * Destroy manager and cleanup resources
   */
  function destroy() {
    // No persistent state to clean up in current implementation
    // Future: cleanup cached canvases, cancel pending operations
  }

  // Return public API
  return Object.freeze({
    prepareTexture,
    waitForTextureReady,
    validateNonEmpty,
    destroy,
    // Export helpers for external use
    helpers: Object.freeze({
      projectSimpleText,
      projectCardGrid,
      measureProjectionBounds
    }),
    config: TEXTURE_CONFIG
  });
}

// ============================================================================
// Texture Source Type Reference
// ============================================================================

/**
 * Texture source types and their ready conditions:
 *
 * | Type              | Element Type           | Ready Condition                                          |
 * |-------------------|------------------------|----------------------------------------------------------|
 * | asset             | HTMLImageElement       | image.decode() + naturalWidth/Height > 0                 |
 * | canvasProjection  | HTMLCanvasElement      | dataset.inkTextureReady="true" + non-empty pixels        |
 * | liveElement       | HTMLElement + adapter  | adapter produces canvas + non-empty pixels               |
 * | none              | N/A                    | No texture needed, commit() switches DOM                 |
 *
 * Non-empty validation:
 * - Sample 3×3 center region of canvas
 * - At least 1 pixel with alpha > 0
 * - Used for canvasProjection and liveElement types
 *
 * Timeout handling:
 * - Default timeout: 1200ms (TEXTURE_CONFIG.READY_TIMEOUT)
 * - On timeout: trigger recovery via recoveryHandler.handleRecovery()
 * - Recovery path: RecoverPresentTarget → show terminal state → ReleaseCooldown → FreeScroll
 *
 * Failure behavior:
 * - Never show pure color or half-blank texture
 * - Always present terminal state of target scene
 * - Log error with observable event (via recovery handler)
 */
