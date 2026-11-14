# FacePay MX — Android (future, not started)

Nothing here yet. This README records the evaluation so the decision is not lost.

## Does the MVP need Android?

**No.** The web kiosk on a Chrome tablet proves the flow. See `docs/06-face-recognition.md` §7.

## Why an Android app will eventually be needed

1. **Play Integrity / DeviceCheck** attestation → blocks virtual cameras, rooted devices, and scripted
   clients. Not possible in a browser.
2. **Certified liveness SDKs** are native-first (FaceTec, Incode, Veridas, Truora, MetaMap).
3. **Camera control**: exposure/focus lock, raw frames, no Safari/WASM quirks.
4. **Keystore/StrongBox** for device keys instead of browser storage.
5. Optional on-device templates (never leave the tablet) — a different privacy trade-off.

## Options

| Option | Effort | Gains | Cost |
| --- | --- | --- | --- |
| Capacitor wrapper of `apps/web` | days | camera, secure storage, Play Integrity plugin | same browser liveness |
| Native (Kotlin + Compose) + CameraX + MediaPipe Tasks + TFLite ArcFace | weeks | full control, attestation, on-device match | duplicate UI, slower iteration |
| Commercial SDK inside native shell | weeks + license | certified liveness, liability transfer | vendor lock-in, per-check cost |

## Non-negotiable rules for whoever builds this

- Reuse `packages/shared` for types, money, phone, enums, and prompts. Do not fork domain logic.
- Talk to the same Edge Functions. Do not add a second payment path.
- A face match still never authorizes money. Same architecture, same caps.
- No face images on device or in transit. If on-device templates are chosen, they must be encrypted
  with Keystore and revocable from the server.
- Ship the QR fallback. A native app without a fallback is a regression in reach.
