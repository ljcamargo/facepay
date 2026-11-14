import { FACE } from '@facepay/shared';
import { drawToCanvas, frameStats, normalize, shortHash } from './capture';
import { DEFAULT_THRESHOLDS, evaluateGates, qualityScore } from './gates';
import type {
  CaptureResult,
  ChallengeKind,
  Embedding,
  EngineOptions,
  FaceEngine,
  FaceGeometry,
  FrameSignals,
  FrameStats,
} from './types';

/** Only what we read from Human's output; keeps the adapter honest and typed. */
interface HumanFace {
  score?: number;
  box?: number[];
  rotation?: { angle?: { yaw?: number; pitch?: number; roll?: number } } | null;
  mesh?: number[][];
  annotations?: Record<string, Array<[number, number, number?]>>;
  gestures?: string[];
  embedding?: number[];
  real?: number;
  live?: number;
}

interface HumanHand {
  confidence?: number;
  landmarks?: Array<[number, number, number?]>;
}

interface HumanResult {
  face?: HumanFace[];
  hand?: HumanHand[];
}

interface HumanInstance {
  load(): Promise<void>;
  warmup(): Promise<void>;
  detect(input: HTMLVideoElement | HTMLCanvasElement): Promise<HumanResult>;
  tf?: { getBackend?(): string };
  dispose?: () => void;
}

type HumanModule = { Human: new (config: unknown) => HumanInstance };

const DEG = 180 / Math.PI;

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toBox(raw: number[] | undefined): { x: number; y: number; width: number; height: number } {
  const [x = 0, y = 0, width = 0, height = 0] = raw ?? [];
  return { x, y, width, height };
}

function hasAnnotations(face: HumanFace, keys: string[]): boolean {
  if (!face.annotations) return false;
  return keys.every((key) => {
    const points = face.annotations?.[key];
    return Array.isArray(points) && points.length > 0;
  });
}

function mapFace(face: HumanFace): FaceGeometry {
  const angle = face.rotation?.angle;
  const meshVisible = Array.isArray(face.mesh) && face.mesh.length > 0;

  return {
    box: toBox(face.box),
    // Human reports radians in `rotation.angle`.
    yaw: safeNumber(angle?.yaw) * DEG,
    pitch: safeNumber(angle?.pitch) * DEG,
    roll: safeNumber(angle?.roll) * DEG,
    visible: {
      eyes: hasAnnotations(face, ['leftEyeUpper0', 'rightEyeUpper0']) || meshVisible,
      nose: hasAnnotations(face, ['noseTip']) || meshVisible,
      mouth: hasAnnotations(face, ['lipsUpperOuter']) || meshVisible,
    },
  };
}

/** Mouth corner spread relative to face width; a rough 0..1 smile proxy. */
function smileFromMesh(face: HumanFace): number {
  const mesh = face.mesh;
  if (!mesh || mesh.length < 300) return 0;
  const left = mesh[61];
  const right = mesh[291];
  if (!left || !right) return 0;

  const width = Math.abs((right[0] ?? 0) - (left[0] ?? 0));
  const mouth = Math.abs((right[1] ?? 0) - (left[1] ?? 0));
  // A smile widens the mouth and lifts the corners; clamp to a sane range.
  return Math.max(0, Math.min(1, (width - mouth) * 6));
}

function countFingers(hand: HumanHand): number {
  const lm = hand.landmarks;
  if (!lm || lm.length < 21) return 0;
  // index, middle, ring, pinky: tip above its PIP joint means extended (y grows down)
  const pairs: Array<[number, number]> = [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ];
  let count = 0;
  for (const [tip, pip] of pairs) {
    const t = lm[tip];
    const p = lm[pip];
    if (t && p && (t[1] ?? 0) < (p[1] ?? 0)) count += 1;
  }
  return count;
}

function signalsFrom(face: HumanFace | undefined, hands: HumanHand[], frame: FrameStats): FrameSignals {
  const gestures = face?.gestures ?? [];
  const blinked = gestures.some((g) => g.includes('blink'));
  const fingers = hands.reduce((sum, hand) => sum + countFingers(hand), 0);

  return {
    blink: blinked,
    yaw: face ? safeNumber(face.rotation?.angle?.yaw) * DEG : 0,
    smile: face ? smileFromMesh(face) : 0,
    hands: hands.length,
    fingers,
    faceScale: face ? toBox(face.box).width / frame.width : 0,
  };
}

/**
 * Human adapter. Models are self-hosted (see scripts/sync-models.ts); loading is
 * lazy so the kiosk does not pay for ~14 MB until someone starts a face payment.
 */
export class HumanFaceEngine implements FaceEngine {
  private human: HumanInstance | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private options: EngineOptions = {};

  async load(options: EngineOptions = {}): Promise<{ backend: string }> {
    if (this.human) return { backend: this.human.tf?.getBackend?.() ?? 'unknown' };
    this.options = options;

    const mod = (await import('@vladmandic/human')) as unknown as HumanModule;
    const human = new mod.Human({
      modelBasePath: options.modelBasePath ?? '/models/human/',
      backend: options.backend ?? 'webgl',
      async: true,
      filter: { enabled: false },
      face: {
        enabled: true,
        detector: { rotation: true, maxDetected: 2, minConfidence: 0.4, return: false },
        mesh: { enabled: true },
        iris: { enabled: false },
        description: { enabled: true },
        emotion: { enabled: false },
        gear: { enabled: false },
        antispoof: { enabled: true },
        liveness: { enabled: true },
      },
      hand: { enabled: options.hands === true, maxDetected: 1 },
      body: { enabled: false },
      object: { enabled: false },
      gesture: { enabled: false },
    });

    await human.load();
    await human.warmup();
    this.human = human;

    return { backend: human.tf?.getBackend?.() ?? 'unknown' };
  }

  isLoaded(): boolean {
    return this.human !== null;
  }

  private canvasFor(): HTMLCanvasElement {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
    }
    return this.canvas;
  }

  /** One detect call per frame: `analyze` and `embed` must not double the work. */
  private async detect(video: HTMLVideoElement | HTMLCanvasElement) {
    const human = this.human;
    if (!human) throw new Error('ENGINE_NOT_LOADED');

    const canvas = this.canvasFor();
    const { ctx, width, height } = drawToCanvas(video, canvas);
    const frame = frameStats(ctx.getImageData(0, 0, width, height));

    const result = await human.detect(video);
    const rawFaces = result.face ?? [];
    const faces = rawFaces.map(mapFace);
    const face = rawFaces[0];

    const real = safeNumber(face?.real, 0);
    const live = face?.live === undefined ? real : safeNumber(face.live, 0);

    return {
      rawFaces,
      faces,
      frame,
      signals: signalsFrom(face, result.hand ?? [], frame),
      liveness: Math.min(real, live),
    };
  }

  async analyze(video: HTMLVideoElement | HTMLCanvasElement): Promise<{
    faces: FaceGeometry[];
    frame: FrameStats;
    signals: FrameSignals;
    liveness: number;
  }> {
    const { faces, frame, signals, liveness } = await this.detect(video);
    return { faces, frame, signals, liveness };
  }

  async embed(video: HTMLVideoElement | HTMLCanvasElement): Promise<CaptureResult> {
    const human = this.human;
    if (!human) throw new Error('ENGINE_NOT_LOADED');

    const analysis = await this.detect(video);
    const rawFaces = analysis.rawFaces;

    const best = rawFaces
      .filter((f) => Array.isArray(f.embedding) && f.embedding.length === FACE.dim)
      .sort((a, b) => safeNumber(b.score) - safeNumber(a.score))[0];

    if (!best?.embedding) throw new Error('NO_EMBEDDING');

    const vector = normalize(best.embedding);
    const embedding: Embedding = {
      vector,
      dim: FACE.dim,
      model: FACE.model,
      version: FACE.modelVersion,
    };

    const gates = evaluateGates(analysis.faces, analysis.frame, DEFAULT_THRESHOLDS);

    return {
      embedding,
      liveness: analysis.liveness,
      quality: qualityScore(gates),
      gates,
      signals: analysis.signals,
    };
  }

  dispose(): void {
    this.human?.dispose?.();
    this.human = null;
    this.canvas = null;
  }
}

/** Kept for the harness: display a stable fingerprint instead of the vector. */
export { shortHash };

/** The challenge list lives in challenge.ts; re-exported for convenience. */
export type { ChallengeKind };
