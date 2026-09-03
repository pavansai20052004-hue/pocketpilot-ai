# Camera Vision Debugger

## Scope and status

Milestone 6 implements an Android-first camera/gallery → on-device OCR → editable confirmation → existing debug workflow. It does not implement voice, arbitrary OCR actions, cloud vision, live frame recognition, or iQOO Office Kit.

The JavaScript/TypeScript flow, server provenance, fixtures, Expo configuration, web bundle, and deterministic tests are verified. This development host has no Android SDK, ADB, emulator, or attached phone, so native OCR accuracy and the physical golden path remain pending.

## Native stack

- Expo SDK 57 `expo-camera` provides the real camera preview, permission hook, capture, and torch.
- `expo-image-picker` imports a user-selected screenshot/photo; its original is always treated as externally owned.
- `expo-image-manipulator` produces a centered guide crop or full-image derivative, applies 90-degree rotation, caps the longest edge at 2200 px, strips original metadata, and writes JPEG cache output.
- `rn-mlkit-ocr` uses the bundled Latin Google ML Kit model (`ocrUseBundled: true`) so recognition needs no network or first-run model fetch.
- `expo-file-system` deletes PocketPilot-owned temporary files best-effort.

These are native modules. Expo Go is unsupported for the OCR path. The web export remains a compile/CI check and will display the scanner UI, but attempting OCR explains that a development build is required.

## Build and run

Install Android Studio/SDK platform tools separately, enable USB debugging on the test phone, and confirm `adb devices` lists it. From the repository:

```powershell
cd apps/mobile
npm run android
```

After the native app is installed, later Metro sessions can use:

```powershell
npm run android:metro
```

Re-run the native build after changing native dependencies or `app.json` plugins.

## User flow

1. Pair the phone and select a workspace on the laptop.
2. Tap **Scan Error**, then **Use Camera** or **Choose Screenshot**.
3. For camera input, grant permission, align error text inside the guide, optionally enable flash, and capture. Permanent denial offers Android Settings; gallery remains available.
4. Review the image. Rotate in 90-degree increments and choose guided crop or full image.
5. PocketPilot preprocesses and recognizes locally, then shows source, duration, quality score, warnings, and editable text. Raw OCR remains separately viewable.
6. Remove secrets/unrelated text and correct OCR mistakes. **Analyze Error** sends only the confirmed text and `CAMERA`/`GALLERY` source to the paired laptop.
7. The existing session, root-cause, patch review, approval, test, and rollback flow continues unchanged.

If the laptop is offline or has no selected workspace, confirmed text stays editable on the phone for retry. No analysis starts silently. Retake/close discards app-owned cache files.

## Quality model

The native OCR library exposes text and geometry but not a calibrated per-result confidence. PocketPilot therefore reports `GOOD`, `REVIEW`, or `POOR` from deterministic, testable heuristics rather than inventing model confidence. Score inputs are visible-text length, technical token count, multi-line structure, and replacement/noise characters.

Every score requires human review. `POOR` and empty output cannot advance unless the user corrects or adds text. Warnings cover empty/short output, low technical signal, noise, trimmed visual headers, possible secrets, and possible prompt injection.

Normalization is deliberately conservative: line endings, non-breaking spaces, full-width technical punctuation, and obvious spacing around technical separators are repaired. Ambiguous `O/0`, `I/l/1`, identifiers, paths, and numeric values are never guessed.

## Fixture evaluation

`demo/vision-fixtures` contains reproducible project-owned 1600×960 PNGs and a generation script:

| Fixture | Coverage |
| --- | --- |
| `python-traceback-clear.png` | Python traceback and quoted path |
| `java-exception-clear.png` | Java exception and multiple frames |
| `typescript-error-clear.png` | TypeScript message, symbol, file, line, column |
| `python-traceback-low-contrast.png` | Low-contrast failure mode |
| `java-exception-rotated.png` | Seven-degree camera-angle simulation |

`expected-tokens.json` defines case-insensitive token scoring. On a physical device, record each fixture's matched/expected count, duration, quality label, manual corrections, and whether guided crop improves it. Do not substitute the mock provider for actual image accuracy.

## Physical acceptance checklist

- Fresh install grants camera only after the user taps **Use Camera**.
- Deny once, retry, permanent denial/settings, and gallery fallback are understandable.
- Flash, preview, retake, rotate, guided crop, and full-image OCR work on the target iQOO phone.
- Airplane mode with Wi-Fi disabled still recognizes all clear fixtures (the bundled model proves no download dependency).
- Raw and normalized text remain separate; edits are the exact text sent.
- Secret and prompt-injection fixture text produces warnings and no automatic action.
- HTTP inspection contains text/source only; no URI, Base64, multipart body, or image bytes.
- Camera and processed cache files disappear after close, retake, and successful handoff; gallery originals remain.
- Offline laptop handoff preserves the review draft, then succeeds after reconnect.
- One real camera capture reaches root cause, patch review, explicit approval, a real passing test, and rollback.

Until this checklist is run on hardware, report Milestone 6 as PARTIAL.

## Known limitations

- Latin-script OCR only; additional models would increase build size and need explicit product justification.
- No perspective correction, deskew, blur scoring, live OCR, or selectable block overlay.
- The guide crop is a deterministic centered rectangle rather than draggable crop handles.
- Quality is a transparent heuristic, not calibrated OCR confidence.
- Best-effort cache deletion can fail if Android has already removed or locked a file.
