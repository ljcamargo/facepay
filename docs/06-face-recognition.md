# 06 — Face recognition, liveness, and the Android question

Goal: **identify** a returning customer in ≤ 3 s on a tablet, in store lighting, with a
false-match rate we can defend, and without storing any image. Anything stronger belongs in
`docs/07-security-privacy.md`'s threat model.

## 1. Requirements

| Requirement | Target |
| --- | --- |
| Time to decision | ≤ 3 s (capture + liveness + match) |
| Lighting | 50–1000 lux, no IR, no depth sensor |
| Distance | 40–80 cm |
| False match (different person accepted) | ≤ 0.1 % at the operating threshold, measured |
| False reject | ≤ 5 % with 2 retries |
| Enrollment | 1 selfie, 1 template, re-enroll anytime |
| Data at rest | 1024 floats, no image, no derived image |
| Failure mode | always fall back to QR, never block the sale |
| Works on | Android Chrome ≥ 120, iPadOS Safari ≥ 17 (verify on the actual device) |

## 2. Options considered

| Option | Embedding | Liveness | Hands | License | Size | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **`@vladmandic/human` 3.x** | HSE FaceRes, **1024-d**, `face.embedding` | `face.antispoof` → `real`, `face.liveness` → `live` (scores) | HandTrack + HandLandmarks | MIT | ~14 MB of models (detector 0.54 + mesh 1.48 + iris 2.6 + faceres 6.98 + antispoof 0.85 + liveness 0.59) | **Chosen for MVP** — one library, one API, liveness + hands included |
| `@vladmandic/face-api` | FaceNet-style **128-d** | none built-in (blink via landmarks) | – | MIT | ~6 MB | Lower accuracy, unmaintained since 2025; rejected |
| MediaPipe Tasks (`@mediapipe/tasks-vision`) + ArcFace/MobileFaceNet ONNX via `onnxruntime-web` | **512-d** (ArcFace) | 478 landmarks + blendshapes → challenge; passive spoof needs a separate model | HandLandmarker (21 pts) | Apache-2.0 | ~4 MB + 100–200 MB ONNX (quantizable to ~25 MB) | **Documented upgrade path** for accuracy; more integration work |
| InsightFace `buffalo_l` in browser | 512-d, SOTA | – | – | MIT (models: non-commercial) | 300 MB+ (quantized ~100 MB) | Too heavy for a browser kiosk; the license matters for commercial use |
| Commercial (FaceTec, Incode, Veridas, Truora, MetaMap, Jumio) | vendor | **certified** 3D/passive liveness, iBeta levels | – | paid | SDK | **The only defensible answer for production money.** Android/iOS SDKs; some offer web |
| AWS Rekognition / Azure Face | vendor | weak in browser; Azure liveness is SDK-only and gated | – | paid | – | Rejected for this flow |

**Decision:** ship the MVP on `@vladmandic/human` behind `packages/face-engine`'s interface
(`detect → quality → liveness → embed`), so swapping to MediaPipe+ArcFace or a commercial SDK is a
package-level change, not a UI rewrite. `docs/10-decisions.md` ADR-005.

Do **not** mix models: embeddings from different models (and sometimes different versions of the same
model) are not comparable. `face_templates.model + model_version` is part of the matching query, and
a model change requires re-enrollment (migration: soft-revoke templates with the old model and ask
users to re-enroll on next visit).

## 3. Capture pipeline

```
getUserMedia(1280×720, facingMode:user, frameRate 24–30)
  → downscale to 640×480 for detection
  → Human.detect(frame)                       [BlazeFace detector + mesh + iris]
  → quality gates (below)                     → reject early, show inline hint
  → liveness: 3 s window, random challenge    → blendshapes / landmarks (Human `face.gestures`)
  → antispoof: face.antispoof (`real`) + face.liveness (`live`)
  → pick best frontal frame                   → Human.face.description → embedding (1024-d)
  → normalize to unit length                  → POST /face/identify
```

### Quality gates (tune per device, all logged)

| Gate | Rule | Hint (es-MX) |
| --- | --- | --- |
| Exactly one face | `face.length === 1` for 5 consecutive frames | "Hay más de una persona en cámara" |
| Frontal | `abs(yaw) < 20°`, `abs(pitch) < 15°`, `abs(roll) < 15°` | "Mira de frente" |
| Size | face box ≥ 180 px of the 640-wide frame | "Acércate un poco" |
| Sharpness | variance of Laplacian ≥ threshold (per device calibration) | "Mantén el rostro quieto" |
| Exposure | mean luma 60–200, no clipping > 5 % | "Hay poca luz" |
| Occlusion | eyes + nose + mouth landmarks visible | "Quítate los lentes de sol" |
| Interior frame | face box fully inside the safe area | "Centra tu rostro" |

### Liveness challenge

Random per attempt, driven by `Human` gestures / mesh:

- `parpadea` — both-eye blink within 2.5 s (eye aspect ratio)
- `gira lentamente a la derecha` — yaw sweep ≥ 18° and back
- `sonríe` — mouth-open/blendshape proxy or landmark corner distance
- `acércate y aléjate` — face-box scale change ≥ 8 %

Accept when the challenge is satisfied **and** `real ≥ 0.7` **and** `live ≥ 0.7` **and** the best
frame is frontal. Three consecutive failures → 60 s cooldown + QR fallback. Randomness defeats
pre-recorded video; it does not defeat a live actor holding a phone, which is exactly why the
financial risk is capped elsewhere.

### Honest limits (write these in the README and tell the client)

| Attack | Browser-only defense | Reality |
| --- | --- | --- |
| Printed photo | mesh/parallax + antispoof | usually caught |
| Photo on a phone screen | glare/beat-frequency + antispoof | **sometimes caught** |
| Replayed video | random challenge | caught if the challenge is truly random |
| Live actor wearing a printed mask | weak | often **not** caught |
| Real-time deepfake / virtual camera | none in-browser | **not caught** |
| Camera injection (OBS virtual cam, rooted device) | none in-browser | **not caught** — needs native attestation |

Consequence: face identification is acceptable for **convenience at low amounts, with bank
confirmation**, not for unattended or high-value payments. This is the core of
`docs/07-security-privacy.md` and the reason Android/Play Integrity or a commercial SDK is on the
roadmap.

## 4. Matching and thresholds

- Store unit-normalized vectors; compare with **cosine similarity** (`1 - (a <=> b)` in pgvector).
- Two-level decision: `top1 ≥ T_accept` **and** `top1 - top2 ≥ margin` (0.08 default). Otherwise
  `ambiguous` → treat as no match. Never guess between two people.
- Starting values: `T_accept = 0.60`, `margin = 0.08`, `T_liveness = 0.75`, `T_quality = 0.60`.
  These are **priors, not truth** — replace them with measured values in Phase 4.

Calibration (`scripts/calibrate.ts`, offline, no PII in the repo):

1. Collect ≥ 300 genuine pairs (same person, different sessions) and ≥ 3 000 impostor pairs under
   store-like lighting; consent + hashes only, embeddings are computed locally and the images deleted.
2. Sweep thresholds → ROC → pick the operating point at **FAR ≤ 0.1 %**, report the FRR there.
3. Repeat per device class (tablet A vs tablet B) and per lighting bucket (day/evening/backlit).
4. Re-run after any model/version/backend change; store the report in `docs/calibration/`.
5. Set the threshold per store from the report; keep a hard floor so nobody can lower it to 0.3 in
   settings for a demo.

Expected reality: HSE FaceRes is good but not ArcFace-grade. If measured FAR at an acceptable FRR is
worse than 1 %, switch to MediaPipe + ArcFace 512-d **before** the pilot, not after.

## 5. Model delivery and performance

- Self-host the model files under `apps/web/public/models/human/` (pey-free, no CDN dependency,
  deterministic version). `modelBasePath: '/models/human/'`.
- Lazy-load the engine **after** the cashier taps "Cobrar con rostro", not on app boot; show a 1–2 s
  "Preparando cámara…" state.
- Cache in Cache Storage/IndexedDB; a service worker keeps ~15 MB warm. First run on store Wi-Fi is
  the slow case — pre-warm during pairing.
- TFJS backend preference: `webgl` → `wasm` → `cpu`. Log the chosen backend; a silent CPU fallback is
  a support ticket.
- Target 12–18 fps at 640×480 on a mid-range Android tablet; if below 8 fps, drop detection to
  320×240 and keep the mesh on the 640 crop.
- No frame is ever uploaded. Add a CI grep test that fails if `fetch`/`supabase` calls appear inside
  the capture loop with a `Blob`/`ImageData` body.

## 6. Hands (optional, cheap, high value)

MediaPipe Hand Landmarker (21 points, ~7.5 MB) or Human's `hand` module:

- **As a second liveness signal:** challenge "muestra 2 dedos" — a pre-recorded video cannot respond
  to a random hand challenge, and hand + face in frame is harder to stage than a face alone.
- **As a gesture UI:** thumbs-up to confirm, open palm to cancel (nice for a kiosk, not required).
- **Not as identity.** Palm-vein recognition needs a NIR camera (not present on tablets); hand
  geometry alone is not unique enough for payments. Do not market it as biometrics.

`@vladmandic/human` ships hand tracking (HandTrack + MediaPipe HandLandmarks, ~3–8 MB) and it is MIT,
so this is cheap: implement `show 2 fingers` as one more random challenge in Phase 4, behind a flag,
with a fallback to the face-only challenges if the hand model fails to load. Do not make the hand
mandatory in the MVP.

## 7. Does this need Android?

**For the demonstrator: no.** A Chrome kiosk tablet is enough to prove the flow and the economics.

**For a real pilot with real money: yes, eventually.** What native buys us:

1. **Play Integrity / DeviceCheck** attestation → the server knows the request comes from a genuine,
   unmodified app on a genuine device. Kills the "virtual camera" and "rooted kiosk" classes.
2. **Camera control** without browser quirks (exposure lock, focus lock, raw frames).
3. **Native liveness SDKs** (commercial, iBeta-certified) are Android/iOS-first; web wrappers are
   weaker or nonexistent.
4. **Secure storage** for device keys (Keystore/StrongBox) instead of a bearer token in IndexedDB.
5. **Depth/IR** on devices that have it (not typical tablets, but true for some POS hardware).

Options, in order of effort:

| Path | Effort | Gets us | Loses |
| --- | --- | --- | --- |
| **Capacitor wrapper** around the web app | days | camera, secure storage, Play Integrity plugin, kiosk mode | still the same browser liveness |
| **Native Compose + CameraX + MediaPipe Tasks + TFLite ArcFace** | weeks | full camera control, attestation, on-device templates if desired | duplicates UI |
| **Commercial SDK** (FaceTec / Incode / Veridas / Truora) | weeks + $ | certified liveness, lower liability | vendor lock-in, cost per check |

Recommended sequence: MVP web → pilot with caps → **Capacitor + Play Integrity + commercial liveness
SDK** for the paid pilot → native only if the SDK demands it. `apps/android/README.md` tracks this.

## 8. Things we will never claim

- "Irreversible" — embeddings are not images, but inversion/linkage attacks exist. Say "no se puede
  reconstruir una foto de forma práctica", not "imposible".
- "Seguro" — the face does not secure the money; the bank app does.
- "Certificado" — nothing here is iBeta/NIST-certified; do not imply it in UI or pitch copy.

## 9. Processing of non-registered visitors

The kiosk embeds **every** face that stands in front of it, including people who are not customers and
have not consented. That is unavoidable for 1:N identification, and it is the largest privacy exposure
in the product (`docs/07` O1).

MVP mitigations, all mandatory:

- A visible, legible notice at the camera: what is processed, why, and how to opt out (pay with QR).
- The embedding is used for the lookup and discarded in the same request. It is never written to
  `face_templates`, logs, or a cache.
- `face_identifications` stores the decision, the similarity, the margin and the model version — never
  the vector.
- No image is captured to disk at any point.

This is a legal question before it is a technical one: a DPIA and a counsel opinion are required before
a paid pilot, and the notice text must be reviewed by the same lawyer who reviews the aviso.

## 10. Licensing and maintenance (checked 2026-11-14)

`@vladmandic/human` itself is **MIT**. The model files inherit the licence of their source
("included models are included under licence inherited from the original model source"):

| Model we ship | Source | Licence |
| --- | --- | --- |
| FaceRes (1024-d embedding) | HSE-asavchenko/HSE_FaceRec_tf | **Apache-2.0** |
| MobileFace (alternative embedding) | becauseofAI/MobileFace | **MIT** |
| BlazeFace, FaceMesh, Iris, HandLandmarks | MediaPipe (Google) | **Apache-2.0** |
| Antispoof / Liveness | not explicitly credited in Human's model list | **unverified — check before commercial use** |

Maintenance: latest npm release **3.3.6 (2025-08-26)**; repository still has activity (last push
2025-12-13). Not abandoned, but not fast-moving either — pin the version and vendor the model files.

Action items before a paid pilot: (a) get a written answer on the antispoof/liveness model licence, or
remove that module and rely on the challenge + a commercial SDK; (b) record the exact model checksums in
`docs/calibration/`; (c) keep the `face-engine` interface so swapping to ArcFace/MediaPipe does not
touch the UI.
