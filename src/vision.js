import sharp from 'sharp';
import { getVisionLimits } from './config.js';

// Image sizing for Claude Vision. Claude reads images in 28×28-px patches
// ("visual tokens"); each model tier has a maximum long edge and a maximum
// token count (see VISION_TIERS in config.js). These helpers size every image
// viewcap returns to fit the active tier exactly, so the API never has to
// downscale it again.

export const PATCH = 28;

export function visualTokens(width, height) {
  return Math.ceil(width / PATCH) * Math.ceil(height / PATCH);
}

// Largest proportional size ≤ (width, height) that fits both limits.
export function fitDimensions(width, height, limits = getVisionLimits()) {
  let scale = Math.min(1, limits.maxEdge / Math.max(width, height));
  const size = (s) => ({
    width: Math.max(1, Math.floor(width * s)),
    height: Math.max(1, Math.floor(height * s)),
  });
  let out = size(scale);
  // Token count is roughly proportional to area, so shrink by the square
  // root of the overshoot, then step down until it fits (ceil() rounding can
  // leave it a patch over).
  while (visualTokens(out.width, out.height) > limits.maxTokens) {
    const ratio = Math.sqrt(limits.maxTokens / visualTokens(out.width, out.height));
    scale *= Math.min(ratio, 0.995);
    out = size(scale);
  }
  return out;
}

// Tallest tile, for an image this wide, that stays within the tier: never
// taller than the max edge, and never more visual tokens than the cap.
export function maxTileHeight(width, limits = getVisionLimits()) {
  const cols = Math.ceil(width / PATCH);
  const rows = Math.max(1, Math.floor(limits.maxTokens / cols));
  return Math.min(limits.maxEdge, rows * PATCH);
}

// Resize a PNG buffer (if needed) so it fits the tier. Returns the buffer and
// its final dimensions.
export async function fitBuffer(buffer, limits = getVisionLimits()) {
  const meta = await sharp(buffer).metadata();
  const target = fitDimensions(meta.width, meta.height, limits);
  if (target.width === meta.width && target.height === meta.height) {
    return { buffer, width: meta.width, height: meta.height };
  }
  const resized = await sharp(buffer)
    .resize({ width: target.width, height: target.height, fit: 'fill' })
    .png()
    .toBuffer();
  return { buffer: resized, width: target.width, height: target.height };
}
