import type { ChallengeKind, ChallengeState, FrameSignals } from './types';

/**
 * Active liveness challenge as a pure state machine.
 *
 * A pre-recorded video cannot answer a random challenge, which is the only
 * anti-replay property we can offer in a browser. The window is short (4 s) so a
 * real person is not asked to perform for long.
 */
export const CHALLENGE_WINDOW_MS = 4000;
export const MIN_HOLD_MS = 250;

export const CHALLENGES: ChallengeKind[] = ['blink', 'turn_right', 'smile', 'hands', 'approach'];

export function pickChallenge(random: () => number = Math.random): ChallengeKind {
  const index = Math.floor(random() * CHALLENGES.length);
  return CHALLENGES[Math.min(index, CHALLENGES.length - 1)] ?? 'blink';
}

export function initialChallenge(kind: ChallengeKind, now: number): ChallengeState {
  return {
    kind,
    startedAt: now,
    satisfied: false,
    failed: false,
    progress: 0,
    seen: false,
    baselineScale: null,
  };
}

export function stepChallenge(
  state: ChallengeState,
  signals: FrameSignals,
  now: number,
  windowMs = CHALLENGE_WINDOW_MS,
): ChallengeState {
  if (state.satisfied || state.failed) return state;

  const elapsed = now - state.startedAt;
  const progress = Math.min(1, elapsed / windowMs);
  const next: ChallengeState = { ...state, progress };

  if (next.baselineScale === null && signals.faceScale > 0) {
    next.baselineScale = signals.faceScale;
  }

  switch (state.kind) {
    case 'blink': {
      if (signals.blink) next.seen = true;
      if (next.seen && elapsed >= MIN_HOLD_MS) next.satisfied = true;
      break;
    }
    case 'turn_right': {
      // Turn away first, then come back: a still photo can do neither.
      if (signals.yaw >= 18) next.seen = true;
      if (next.seen && Math.abs(signals.yaw) <= 10 && elapsed >= MIN_HOLD_MS) {
        next.satisfied = true;
      }
      break;
    }
    case 'smile': {
      if (signals.smile >= 0.5) next.seen = true;
      if (next.seen && elapsed >= MIN_HOLD_MS) next.satisfied = true;
      break;
    }
    case 'hands': {
      if (signals.hands >= 1 && signals.fingers >= 2) next.seen = true;
      if (next.seen) next.satisfied = true;
      break;
    }
    case 'approach': {
      const baseline = next.baselineScale ?? signals.faceScale;
      if (baseline > 0 && signals.faceScale >= baseline * 1.08) next.seen = true;
      if (next.seen) next.satisfied = true;
      break;
    }
  }

  if (!next.satisfied && elapsed >= windowMs) next.failed = true;
  return next;
}

/** Human-readable instruction; the kiosk maps this to the es-MX copy deck. */
export function challengeLabelKey(kind: ChallengeKind): string {
  switch (kind) {
    case 'blink':
      return 'kiosk.identify.challenge.blink';
    case 'turn_right':
      return 'kiosk.identify.challenge.turnRight';
    case 'smile':
      return 'kiosk.identify.challenge.smile';
    case 'hands':
      return 'kiosk.identify.challenge.hands';
    case 'approach':
      return 'kiosk.identify.challenge.approach';
  }
}
