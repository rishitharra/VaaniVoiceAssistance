# Vaani 4.3 — implementation audit and verification

## Implemented

- Continuous phoneme alignment retained: word boundaries come from the known text and sound sequence, not a fixed silence duration. Added next-word context in alignment and GOP scoring. Ambiguous unreleased T/D before another stop/nasal, and shared same-consonant boundaries, are not turned into hard errors when the boundary sound is missing/uncertain. They remain uncertain rather than automatically correct.
- A sound with isolated errors or mostly uncertain occurrences no longer gets a misleading matched classification. Unclear/interpolated words cannot become matched just because a later score is high.
- Clear-reading gate requires enough words/phones, no unclear words or phone errors, predominantly matched finite scores, and usable approximate audio quality. It persists a random-practice unlock. No-flags-but-uncertain recordings do not unlock it. The message is “No mistakes detected in the sounds we could assess,” not a guarantee of perfect pronunciation.
- Random practice is a separate home action, uses the sentence bank, and avoids recent sentences. Targeted practice still uses confirmed weaknesses.
- Second-model checks reload the enabled checkpoint after browser refresh. A second-model load failure is surfaced rather than silently reverting to one model. Disagreement/non-finite second-model evidence cannot claim a confident match.
- Natural-voice selection preserves other settings. Worker crashes reject pending work and allow retry instead of leaving analysis indefinitely busy.
- Mic selector, six-second check, echo cancellation, level meter, start-pending state, cancellation, three-minute recording cap, capture/disconnection errors, and mic resource cleanup. Recordings are resampled to 16 kHz mono. Navigation ignores stale analysis results.
- CMUdict-derived minimal-pair suggestions for the practice vocabulary, 20 focused sentences, articulation text for all supported phones, and curated pronunciation notes. Contrast text is conditional and asks the user to listen before confirming.
- Disagreed sounds are excluded from future score calibration. Uncertain observations reset an active sound's clean streak. Usable evidence only is included in calibration.
- Save imports are validated before changes and replaced atomically. Session/profile writes are atomic. Recording-storage failures do not discard saved progress. Startup/settings/session save failures have visible messages.
- Video captions and missing-video error handling. Exact content setup is in CONTENT_GUIDE.md.
- Vite upgraded to 6.4.3-compatible range; vulnerable transitive sharp pinned to a patched range. Refreshed npm lockfile reports zero known vulnerabilities at the time checked.

## Model decision

No checkpoint was changed merely based on recency. The current model is already an Apache-2.0 quantized ONNX export designed for browser phoneme recognition. Sources reviewed on 2026-09-20:

- Current checkpoint: https://huggingface.co/robg/speako-phoneme-recognizer — browser/WASM-compatible phoneme model; approximately 355 MB quantized weights.
- Candidate: https://huggingface.co/asingingbird/buddy-pronunciation-onnx — different ARPAbet/stress vocabulary and raw ONNX loading contract; its small reported comparison is not a Vaani validation set.
- Candidate: https://huggingface.co/slplab/wav2vec2-large-robust-L2-english-phoneme-recognition — trained/evaluated on Korean learners; reported results do not establish superiority across Vaani's users, microphones, and accents. Not a drop-in browser artifact.

Replacing the current model responsibly needs a held-out recording comparison of false flags, missed errors, word timing, memory, and browser latency. Newer speech-to-text models are not necessarily better pronunciation assessors. Model weights remain external downloads and are not included in the ZIP.

## Verification

Existing alignment, synthetic GOP, and sentence-selection checks passed. Added 22 regression checks: continuous words, would-be boundary, isolated final d, missing words, empty alignment, sufficient/uncertain/clipped/noisy evidence, persistent unlock, no accidental unlock, dismissed calibration, clean-streak reset, think/sink and vest/west contrasts, unknown-word fallback, articulation coverage, random-set variety, valid/invalid save imports, and second-model disagreement.

TypeScript checking and a production Vite/PWA build passed. This Windows sandbox prevented the ordinary tsx launcher from querying the OS user and prevented esbuild's config bundler from enumerating parent folders. Tests were therefore run through a local TypeScript transpilation loader, and the same Vite configuration was supplied through Vite's build API. These environment workarounds are not shipped as application changes.

Browser smoke checks used an isolated component harness with synthetic profile data: random-practice action, recorder controls, and coaching fallback. This is not a real acoustic-model/microphone end-to-end test. No user audio was recorded during verification.

## Remaining limitations and demo validation

This is a source audit and regression-tested update, not a claim that every flaw has been eliminated. Acoustic thresholds are conservative heuristics, not a calibrated accuracy guarantee. Continuous/global alignment can still drift on repeated/skipped words. TIMIT-derived inventory merges some distinctions. GOP uses per-word windows; context helps but is not a complete model of coarticulation. Noise estimates are rough signal-level contrasts, and clipped audio after preprocessing may be underestimated. Check actual recordings.

The original blueprint mentions animated anatomical mouth guides and capped YouTube embeds. They were not present in v4.2 and this update supplies text coaching/local video slots rather than claiming to provide anatomically validated animations or a YouTube integration. Team-produced clips are still needed. Text coaching works before those clips are ready.

Recommended manual acceptance set, with the same computer mic you will use at the hackathon:

1. At least three speakers read “I would be glad to help” and “She could bring the red bag” naturally and with deliberate gaps. Natural blending should not create repeated D/T flags.
2. Read targeted th and V/W sentences correctly, then deliberately substitute th→s and v→w in at least two distinct words. Compare false flags and missed detections; use Agree/Disagree review.
3. Try silence, a distant mic, loud clipping, background conversation, skipped words, and only half the paragraph. None should present an unqualified success/unlock.
4. Verify a sufficiently clear reading unlocks random practice, then reload and confirm it stays unlocked. Dismissing flags alone must not unlock it.
5. Enable the second model, reload, and confirm the result's model label includes the second model. Turn it off and compare latency/results.
6. Test permission denial, unplugging a USB mic, cancel while permission is pending, switching microphone, double-clicking Start, leaving the recorder, and recording again.
7. Add one TH clip and captions using CONTENT_GUIDE.md. Check Repeat, the time cap, missing file fallback, keyboard use, and mobile layout.
8. Export/import a save, check persistence after refresh, and test offline after the first model download. Local videos need their own cache policy.

Log false flags and misses by speaker/word/sound, not only a global “accuracy” number. Keep recordings local unless participants separately agree to share them for evaluation.
