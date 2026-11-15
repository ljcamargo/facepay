import type { CopyKey } from '@facepay/shared';
import type { FaceGeometry, FrameStats, GateResult, GateThresholds } from './types';

/**
 * Quality gates. Pure functions: no DOM, no model, no camera. Everything here is
 * unit-tested, which is why the thresholds can be tuned with confidence.
 */
export const DEFAULT_THRESHOLDS: GateThresholds = {
  // Deliberately forgiving: this is an MVP and a soft webcam is not a portal
  // camera. Values measured on /dev/face; tighten after calibration.
  maxYawDeg: 30,
  maxPitchDeg: 25,
  maxRollDeg: 25,
  minFaceRatio: 0.2,
  minSharpness: 18,
  minLuma: 60,
  maxLuma: 205,
  maxClippedRatio: 0.05,
};

export function faceRatio(box: { width: number }, frameWidth: number): number {
  if (frameWidth <= 0) return 0;
  return box.width / frameWidth;
}

export function isInsideFrame(
  box: { x: number; y: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
  margin = 0.02,
): boolean {
  const m = margin * frameWidth;
  return (
    box.x >= m &&
    box.y >= m &&
    box.x + box.width <= frameWidth - m &&
    box.y + box.height <= frameHeight - m
  );
}

export function evaluateGates(
  faces: FaceGeometry[],
  frame: FrameStats,
  thresholds: GateThresholds = DEFAULT_THRESHOLDS,
): GateResult[] {
  const results: GateResult[] = [];
  const face = faces[0];

  results.push({
    id: 'single_face',
    ok: faces.length === 1,
    hintKey: faces.length > 1 ? 'kiosk.identify.hint.multiple' : 'kiosk.identify.hint.center',
  });

  if (!face) {
    // Without a face the remaining checks cannot pass; report them as failed.
    const rest: Array<[GateResult['id'], CopyKey]> = [
      ['size', 'kiosk.identify.hint.far'],
      ['frontal', 'kiosk.identify.hint.center'],
      ['sharpness', 'kiosk.identify.hint.still'],
      ['exposure', 'kiosk.identify.hint.dark'],
      ['visible', 'kiosk.identify.hint.occluded'],
      ['inside', 'kiosk.identify.hint.center'],
    ];
    for (const [id, hintKey] of rest) results.push({ id, ok: false, hintKey });
    return results;
  }

  results.push({
    id: 'size',
    ok: faceRatio(face.box, frame.width) >= thresholds.minFaceRatio,
    hintKey: 'kiosk.identify.hint.far',
  });

  results.push({
    id: 'frontal',
    ok:
      Math.abs(face.yaw) <= thresholds.maxYawDeg &&
      Math.abs(face.pitch) <= thresholds.maxPitchDeg &&
      Math.abs(face.roll) <= thresholds.maxRollDeg,
    hintKey: 'kiosk.identify.hint.center',
  });

  results.push({
    id: 'sharpness',
    ok: frame.sharpness >= thresholds.minSharpness,
    hintKey: 'kiosk.identify.hint.still',
  });

  const tooDark = frame.meanLuma < thresholds.minLuma;
  const tooBright = frame.meanLuma > thresholds.maxLuma || frame.clippedRatio > thresholds.maxClippedRatio;
  results.push({
    id: 'exposure',
    ok: !tooDark && !tooBright,
    hintKey: tooBright ? 'kiosk.identify.hint.bright' : 'kiosk.identify.hint.dark',
  });

  results.push({
    id: 'visible',
    ok: face.visible.eyes && face.visible.nose && face.visible.mouth,
    hintKey: 'kiosk.identify.hint.occluded',
  });

  results.push({
    id: 'inside',
    ok: isInsideFrame(face.box, frame.width, frame.height),
    hintKey: 'kiosk.identify.hint.center',
  });

  return results;
}

/** The most actionable hint: the first failure, in gate order. */
export function worstHint(gates: GateResult[]): CopyKey | null {
  const failed = gates.find((g) => !g.ok);
  return failed ? failed.hintKey : null;
}

/** 0..1, weighted so identity-critical gates hurt more than framing. */
export function qualityScore(gates: GateResult[]): number {
  const weights: Partial<Record<GateResult['id'], number>> = {
    single_face: 3,
    visible: 3,
    frontal: 2,
    size: 2,
    sharpness: 1,
    exposure: 1,
    inside: 1,
  };
  let total = 0;
  let passed = 0;
  for (const gate of gates) {
    const w = weights[gate.id] ?? 1;
    total += w;
    if (gate.ok) passed += w;
  }
  return total === 0 ? 0 : passed / total;
}

/** Human reports 0..1 confidence; below this we do not even attempt a match. */
export const MIN_USABLE_QUALITY = 0.75;
