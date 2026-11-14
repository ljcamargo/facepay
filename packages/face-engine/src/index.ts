export * from './types';
export * from './gates';
export * from './challenge';
export { drawToCanvas, frameStats, measureVideo, normalize, shortHash } from './capture';
export { HumanFaceEngine } from './human-engine';

import { HumanFaceEngine } from './human-engine';
import type { FaceEngine } from './types';

/**
 * The app depends on this interface, never on Human directly. Swapping to
 * MediaPipe + ArcFace (or a commercial SDK) is a change inside this package.
 */
export function createFaceEngine(): FaceEngine {
  return new HumanFaceEngine();
}
