import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_THRESHOLDS,
  evaluateGates,
  qualityScore,
  worstHint,
  isInsideFrame,
} from './gates';
import type { FaceGeometry, FrameStats } from './types';

const frame: FrameStats = {
  width: 640,
  height: 480,
  meanLuma: 128,
  clippedRatio: 0.01,
  sharpness: 120,
};

function face(overrides: Partial<FaceGeometry> = {}): FaceGeometry {
  return {
    box: { x: 200, y: 120, width: 240, height: 280 },
    yaw: 2,
    pitch: 1,
    roll: -1,
    visible: { eyes: true, nose: true, mouth: true },
    ...overrides,
  };
}

const byId = (gates: ReturnType<typeof evaluateGates>) =>
  Object.fromEntries(gates.map((g) => [g.id, g.ok]));

describe('evaluateGates', () => {
  test('a good frame passes everything', () => {
    const gates = evaluateGates([face()], frame);
    expect(gates.every((g) => g.ok)).toBe(true);
    expect(qualityScore(gates)).toBe(1);
  });

  test('two faces fails single_face with the right hint', () => {
    const gates = evaluateGates([face(), face()], frame);
    expect(byId(gates).single_face).toBe(false);
    expect(worstHint(gates)).toBe('kiosk.identify.hint.multiple');
  });

  test('no face fails every downstream gate', () => {
    const gates = evaluateGates([], frame);
    expect(gates).toHaveLength(7);
    expect(gates.every((g) => !g.ok)).toBe(true);
  });

  test('small face fails size', () => {
    const gates = evaluateGates([face({ box: { x: 300, y: 200, width: 80, height: 100 } })], frame);
    expect(byId(gates).size).toBe(false);
  });

  test('extreme yaw fails frontal', () => {
    const gates = evaluateGates([face({ yaw: 35 })], frame);
    expect(byId(gates).frontal).toBe(false);
  });

  test('blur fails sharpness', () => {
    const gates = evaluateGates([face()], { ...frame, sharpness: 5 });
    expect(byId(gates).sharpness).toBe(false);
    expect(worstHint(gates)).toBe('kiosk.identify.hint.still');
  });

  test('dark and blown-out frames fail exposure with different hints', () => {
    const dark = evaluateGates([face()], { ...frame, meanLuma: 20 });
    expect(byId(dark).exposure).toBe(false);
    expect(dark.find((g) => g.id === 'exposure')?.hintKey).toBe('kiosk.identify.hint.dark');

    const bright = evaluateGates([face()], { ...frame, meanLuma: 240, clippedRatio: 0.4 });
    expect(byId(bright).exposure).toBe(false);
    expect(bright.find((g) => g.id === 'exposure')?.hintKey).toBe('kiosk.identify.hint.bright');
  });

  test('occluded face fails visible', () => {
    const gates = evaluateGates(
      [face({ visible: { eyes: true, nose: false, mouth: true } })],
      frame,
    );
    expect(byId(gates).visible).toBe(false);
    expect(worstHint(gates)).toBe('kiosk.identify.hint.occluded');
  });

  test('face touching the border fails inside', () => {
    const gates = evaluateGates([face({ box: { x: 0, y: 0, width: 240, height: 280 } })], frame);
    expect(byId(gates).inside).toBe(false);
  });

  test('quality score is weighted, not a plain ratio', () => {
    const gates = evaluateGates([face()], { ...frame, sharpness: 1 });
    // sharpness has weight 1 of 13 total
    expect(qualityScore(gates)).toBeCloseTo(12 / 13, 5);
  });

  test('thresholds are resolution-independent for size', () => {
    const small = evaluateGates([face({ box: { x: 20, y: 20, width: 100, height: 100 } })], {
      ...frame,
      width: 320,
      height: 240,
    });
    // 100/320 = 0.31 >= 0.28 even though it is small in pixels
    expect(byId(small).size).toBe(true);
  });
});

describe('isInsideFrame', () => {
  test('accepts a centered box and rejects overflow', () => {
    expect(isInsideFrame({ x: 100, y: 100, width: 200, height: 200 }, 640, 480)).toBe(true);
    expect(isInsideFrame({ x: -5, y: 100, width: 200, height: 200 }, 640, 480)).toBe(false);
  });
});

test('default thresholds are the documented priors', () => {
  expect(DEFAULT_THRESHOLDS.maxYawDeg).toBe(20);
  expect(DEFAULT_THRESHOLDS.minFaceRatio).toBeCloseTo(0.28, 5);
});
