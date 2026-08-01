/**
 * scripts/chroma.js
 * Pure-canvas chroma key removal. No external dependencies.
 * Exposed as window.lcChroma.
 *
 * Part of the living-characters sprite billboard system.
 */

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

/** Convert r,g,b (0–255) to [h (0–360), s (0–1), l (0–1)] */
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    default: h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s, l];
}

/**
 * Angular distance between two hues (0–360), result in 0–1 range
 * where 1.0 means 180 degrees apart (maximally different).
 */
function hueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return (d > 180 ? 360 - d : d) / 180;
}

// ---------------------------------------------------------------------------
// Core pixel processor — operates on a Uint8ClampedArray in place
// ---------------------------------------------------------------------------

function processPixels(data, opts) {
  const { h = 120, tolerance = 0.35, spill = 0.15 } = opts || {};
  const outer = tolerance + spill;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const [pH, pS] = rgbToHsl(r, g, b);

    // Low-saturation pixels (near grey/white/black) are never keyed
    if (pS < 0.2) continue;

    const dist = hueDist(pH, h);

    if (dist <= tolerance) {
      // Fully inside key zone → fully transparent
      data[i + 3] = 0;
    } else if (dist <= outer) {
      // Soft fringe zone → lerp alpha + suppress spill
      const t = (dist - tolerance) / spill;
      data[i + 3] = Math.round(t * data[i + 3]);

      // Green spill suppression: shift green toward mid of red & blue
      const avg = (r + b) / 2;
      data[i + 1] = Math.round(g * t + avg * (1 - t));
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply chroma key to a dataURL image.
 * @param {string} imageDataUrl
 * @param {{ h?: number, tolerance?: number, spill?: number }} [options]
 * @returns {Promise<string>} transparent-background PNG data URL
 */
function chromaKey(imageDataUrl, options) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      processPixels(imageData.data, options);
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = imageDataUrl;
  });
}

/**
 * Apply chroma key directly to an existing canvas.
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {{ h?: number, tolerance?: number, spill?: number }} [options]
 * @returns {HTMLCanvasElement} new canvas with alpha applied
 */
function chromaKeyCanvas(sourceCanvas, options) {
  const out = document.createElement('canvas');
  out.width = sourceCanvas.width;
  out.height = sourceCanvas.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0);
  const imageData = ctx.getImageData(0, 0, out.width, out.height);
  processPixels(imageData.data, options);
  ctx.putImageData(imageData, 0, 0);
  return out;
}

/**
 * Sample the hue at a specific pixel coordinate in a dataURL image.
 * Used by the eyedropper in the chroma key modal.
 * @param {string} imageDataUrl
 * @param {number} x
 * @param {number} y
 * @returns {Promise<number>} hue value 0–360
 */
function sampleHue(imageDataUrl, x, y) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const px = Math.round(x);
      const py = Math.round(y);
      const d = ctx.getImageData(px, py, 1, 1).data;
      const [hue] = rgbToHsl(d[0], d[1], d[2]);
      resolve(hue);
    };
    img.onerror = reject;
    img.src = imageDataUrl;
  });
}

// ---------------------------------------------------------------------------
// Expose globally
// ---------------------------------------------------------------------------

window.lcChroma = { chromaKey, chromaKeyCanvas, sampleHue };
