import type { FrameStats } from './types';

/**
 * Canvas helpers. The video frame is copied into an offscreen canvas, downscaled,
 * measured, and dropped. Nothing here serializes pixels.
 */

const ANALYSIS_WIDTH = 640;

export function drawToCanvas(
  source: HTMLVideoElement | HTMLCanvasElement,
  canvas: HTMLCanvasElement,
  targetWidth = ANALYSIS_WIDTH,
): { ctx: CanvasRenderingContext2D; width: number; height: number } {
  const isCanvas = typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement;
  const vw = isCanvas ? (source as HTMLCanvasElement).width : (source as HTMLVideoElement).videoWidth || 640;
  const vh = isCanvas ? (source as HTMLCanvasElement).height : (source as HTMLVideoElement).videoHeight || 480;
  const scale = Math.min(1, targetWidth / vw);
  const width = Math.round(vw * scale);
  const height = Math.round(vh * scale);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('CANVAS_2D_UNAVAILABLE');

  ctx.drawImage(source, 0, 0, width, height);
  return { ctx, width, height };
}

/** Mean luma, clipping ratio, and variance of the Laplacian (sharpness). */
export function frameStats(image: ImageData): FrameStats {
  const { width, height, data } = image;
  const luma = new Float32Array(width * height);

  let sum = 0;
  let clipped = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luma[p] = y;
    sum += y;
    if (y <= 2 || y >= 253) clipped += 1;
  }

  const meanLuma = sum / (width * height);
  const clippedRatio = clipped / (width * height);

  // Variance of the 4-neighbour Laplacian, sampled every 2 px.
  let lapSum = 0;
  let lapSqSum = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const c = luma[y * width + x] ?? 0;
      const up = luma[(y - 1) * width + x] ?? 0;
      const down = luma[(y + 1) * width + x] ?? 0;
      const left = luma[y * width + (x - 1)] ?? 0;
      const right = luma[y * width + (x + 1)] ?? 0;
      const lap = 4 * c - up - down - left - right;
      lapSum += lap;
      lapSqSum += lap * lap;
      count += 1;
    }
  }

  const mean = count > 0 ? lapSum / count : 0;
  const variance = count > 0 ? lapSqSum / count - mean * mean : 0;

  return { width, height, meanLuma, clippedRatio, sharpness: Math.max(0, variance) };
}

export function measureVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement): FrameStats {
  const { ctx, width, height } = drawToCanvas(video, canvas);
  return frameStats(ctx.getImageData(0, 0, width, height));
}

/** Deterministic short hash for displaying "this is stored" without exposing it. */
export function shortHash(vector: Float32Array | number[]): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < vector.length; i += 1) {
    const v = Math.round((vector[i] ?? 0) * 10000);
    h1 = (h1 ^ v) * 0x01000193;
    h2 = (h2 + v * 31) >>> 0;
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `${hex(h1)}${hex(h2)}`.slice(0, 12);
}

export function normalize(vector: ArrayLike<number>): Float32Array {
  const out = new Float32Array(vector.length);
  let norm = 0;
  for (let i = 0; i < vector.length; i += 1) {
    const v = vector[i] ?? 0;
    norm += v * v;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vector.length; i += 1) out[i] = (vector[i] ?? 0) / norm;
  return out;
}
