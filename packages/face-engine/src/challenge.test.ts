import { describe, expect, test } from 'bun:test';
import {
  CHALLENGE_WINDOW_MS,
  initialChallenge,
  pickChallenge,
  stepChallenge,
} from './challenge';
import type { ChallengeKind, FrameSignals } from './types';

const neutral: FrameSignals = {
  blink: false,
  yaw: 0,
  smile: 0,
  hands: 0,
  fingers: 0,
  faceScale: 0.4,
};

const withSignal = (patch: Partial<FrameSignals>): FrameSignals => ({ ...neutral, ...patch });

function run(kind: ChallengeKind, frames: Array<[number, FrameSignals]>) {
  let state = initialChallenge(kind, 0);
  for (const [t, signals] of frames) state = stepChallenge(state, signals, t);
  return state;
}

describe('pickChallenge', () => {
  test('is deterministic given a random source and never out of range', () => {
    expect(pickChallenge(() => 0)).toBe('blink');
    expect(pickChallenge(() => 0.99)).toBe('approach');
  });
});

describe('blink', () => {
  test('a single blink satisfies after the hold window', () => {
    const state = run('blink', [
      [100, withSignal({ blink: true })],
      [400, neutral],
    ]);
    expect(state.satisfied).toBe(true);
    expect(state.failed).toBe(false);
  });

  test('no blink times out', () => {
    const state = stepChallenge(initialChallenge('blink', 0), neutral, CHALLENGE_WINDOW_MS);
    expect(state.failed).toBe(true);
  });
});

describe('turn_right', () => {
  test('requires turning and coming back', () => {
    const turned = run('turn_right', [[200, withSignal({ yaw: 25 })]]);
    expect(turned.satisfied).toBe(false);
    expect(turned.seen).toBe(true);

    const back = run('turn_right', [
      [200, withSignal({ yaw: 25 })],
      [400, withSignal({ yaw: 2 })],
    ]);
    expect(back.satisfied).toBe(true);
  });

  test('a still face never satisfies', () => {
    const state = run('turn_right', [[500, neutral]]);
    expect(state.satisfied).toBe(false);
    expect(state.seen).toBe(false);
  });
});

describe('smile', () => {
  test('requires a strong smile', () => {
    expect(run('smile', [[300, withSignal({ smile: 0.2 })]], ).satisfied).toBe(false);
    expect(run('smile', [[300, withSignal({ smile: 0.8 })]], ).satisfied).toBe(true);
  });
});

describe('hands', () => {
  test('needs two extended fingers', () => {
    expect(run('hands', [[300, withSignal({ hands: 1, fingers: 1 })]]).satisfied).toBe(false);
    expect(run('hands', [[300, withSignal({ hands: 1, fingers: 2 })]]).satisfied).toBe(true);
  });
});

describe('approach', () => {
  test('uses the first frame as baseline', () => {
    const near = run('approach', [
      [100, withSignal({ faceScale: 0.4 })],
      [300, withSignal({ faceScale: 0.44 })],
    ]);
    expect(near.baselineScale).toBeCloseTo(0.4, 5);
    expect(near.satisfied).toBe(true);

    const still = run('approach', [
      [100, withSignal({ faceScale: 0.4 })],
      [300, withSignal({ faceScale: 0.41 })],
    ]);
    expect(still.satisfied).toBe(false);
  });
});

describe('progress and termination', () => {
  test('progress tracks the window and freezes once satisfied', () => {
    const state = run('blink', [[2000, neutral]]);
    expect(state.progress).toBeCloseTo(0.5, 2);
    expect(state.satisfied).toBe(false);

    const done = run('blink', [
      [100, withSignal({ blink: true })],
      [400, neutral],
    ]);
    const after = stepChallenge(done, neutral, 3000);
    expect(after).toBe(done); // terminal states are immutable
  });
});
