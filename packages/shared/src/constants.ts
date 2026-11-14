/** Tunables that must agree across UI, Edge Functions and docs. */

/** Pilot guardrail, not a security control: the bank authorizes the money. */
export const PILOT_LIMIT_CENTS = 30_000; // $300.00 MXN

/** Face matching priors. Calibrated in Phase 4 (scripts/calibrate.ts). */
export const FACE = {
  minSimilarity: 0.6,
  minMargin: 0.08,
  minLiveness: 0.75,
  minQuality: 0.6,
  model: 'human-hse-faceres',
  modelVersion: '3.3.6',
  dim: 1024,
} as const;

/** Seconds. pey rejects anything below 360. */
export const PUSH_EXPIRATION_SECONDS = 600;
export const QR_EXPIRATION_SECONDS = 600;
export const ONBOARDING_TTL_MINUTES = 15;
export const IDENTIFY_COOLDOWN_SECONDS = 60;

/** Version stamped into consent evidence. Bump when the text changes. */
export const LEGAL_DOC_VERSION = '2026-11-14';

/** Demo PIN for the kiosk settings screen (Phase 1 mock only). */
export const DEMO_SETTINGS_PIN = '1234';
