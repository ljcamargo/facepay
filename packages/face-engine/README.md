# `@facepay/face-engine`

Browser-only face capture pipeline. Wraps `@vladmandic/human` behind a stable interface so the model
can be swapped for MediaPipe + ArcFace or a commercial SDK without touching the UI.

## Interface

```ts
export interface FaceEngine {
  load(opts?: { modelBasePath?: string }): Promise<void>;
  start(video: HTMLVideoElement): Promise<void>;
  stop(): void;
  /** one frame → quality + liveness signals */
  analyzeFrame(): FrameReport;
  /** run a random challenge; resolves with the best frontal frame + scores */
  runChallenge(kind: Challenge): Promise<CaptureResult>;
  /** embed a captured frame in-memory (never uploaded as an image) */
  embed(capture: CaptureResult): Promise<Embedding>;
}

type Challenge = 'blink' | 'turn_right' | 'smile' | 'approach';
interface Embedding { vector: Float32Array; dim: 1024; model: string; version: string }
```

## Guarantees

- **No image ever leaves the browser.** No `fetch`, no `supabase` call, no `Blob` upload in this package.
- Frames live in a single reusable canvas and are released after each capture.
- Models are loaded lazily from `/models/human/` and cached by the service worker.
- Everything degrades: if models fail to load, `load()` rejects with a typed error and the UI shows the
  QR fallback instead of a spinner.
- Quality gates are pure functions with unit tests (face count, yaw/pitch/roll, min pixel size,
  Laplacian sharpness, exposure). Thresholds live in `constants.ts` and are documented in `docs/06`.
- The ephemeral visualization (`vectorBars()`) is client-side only and is not part of the API surface
  used by the kiosk; the stored template is never returned by the server.

## Testing

- Unit: gates and geometry with synthetic landmarks.
- Manual: 30 captures per device class, recorded as aggregate metrics in `docs/calibration/`.
- Never commit test images or embeddings.
