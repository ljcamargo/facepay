import type { CopyKey } from '@facepay/shared';

/** Everything the UI needs to know about one frame. No image ever leaves this object. */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceGeometry {
  box: Box;
  /** degrees; 0 is looking straight at the camera */
  yaw: number;
  pitch: number;
  roll: number;
  /** coarse answer to "can I see the eyes, nose and mouth?" */
  visible: { eyes: boolean; nose: boolean; mouth: boolean };
}

export interface FrameStats {
  width: number;
  height: number;
  /** 0..255 */
  meanLuma: number;
  /** 0..1 share of pixels at 0 or 255 */
  clippedRatio: number;
  /** variance of the Laplacian over the downscaled luma; higher is sharper */
  sharpness: number;
}

export type GateId =
  | 'single_face'
  | 'frontal'
  | 'size'
  | 'sharpness'
  | 'exposure'
  | 'visible'
  | 'inside';

export interface GateResult {
  id: GateId;
  ok: boolean;
  hintKey: CopyKey;
}

export interface GateThresholds {
  maxYawDeg: number;
  maxPitchDeg: number;
  maxRollDeg: number;
  /** face box width as a share of the frame width */
  minFaceRatio: number;
  minSharpness: number;
  minLuma: number;
  maxLuma: number;
  maxClippedRatio: number;
}

export type ChallengeKind = 'blink' | 'turn_right' | 'smile' | 'hands' | 'approach';

/** Per-frame signals extracted from the model output. */
export interface FrameSignals {
  blink: boolean;
  yaw: number;
  /** 0..1 */
  smile: number;
  hands: number;
  /** extended fingers across all detected hands */
  fingers: number;
  /** face box width / frame width, for the approach challenge */
  faceScale: number;
}

export interface ChallengeState {
  kind: ChallengeKind;
  startedAt: number;
  satisfied: boolean;
  failed: boolean;
  /** 0..1 for the progress ring */
  progress: number;
  seen: boolean;
  baselineScale: number | null;
}

export interface Embedding {
  /** unit-normalized */
  vector: Float32Array;
  dim: number;
  model: string;
  version: string;
}

export interface CaptureResult {
  embedding: Embedding;
  liveness: number;
  quality: number;
  gates: GateResult[];
  signals: FrameSignals;
}

export interface EngineOptions {
  /** where the model files live; self-hosted in production */
  modelBasePath?: string;
  /** hands cost ~8 MB of models; off by default */
  hands?: boolean;
  backend?: 'webgl' | 'wasm' | 'cpu';
}

export interface FaceEngine {
  load(options?: EngineOptions): Promise<{ backend: string }>;
  isLoaded(): boolean;
  analyze(video: HTMLVideoElement | HTMLCanvasElement): Promise<{ faces: FaceGeometry[]; frame: FrameStats; signals: FrameSignals; liveness: number }>;
  embed(video: HTMLVideoElement | HTMLCanvasElement): Promise<CaptureResult>;
  dispose(): void;
}
