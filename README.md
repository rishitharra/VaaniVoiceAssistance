# Vaani 4.3

Pronunciation practice that runs entirely in the browser. Speech analysis stays on your device. First use downloads the model (~360 MB); optional second-model and natural-voice downloads are separate. Cached models support offline use, subject to browser cache retention. Browser reference voices and external source links may use the network. See CONTENT_GUIDE.md for video caching.

Read [CONTENT_GUIDE.md](CONTENT_GUIDE.md) for exact media paths and labels, and [AUDIT_AND_TESTS.md](AUDIT_AND_TESTS.md) for changes, model decisions, and verification limits.

## Run
Use Node 22.12+ (Node 24 recommended).
```
npm ci
npm run dev              # http://localhost:5173 (Chrome/Edge recommended)
npm run build            # static site in dist/ (Vercel, Netlify, GitHub Pages)
npm run test:align       # offline aligner/classifier test
npm run test:selector    # practice-set generator test
npm run test:gop         # GOP scoring test on synthetic model output
npm run build:lexicon    # regenerate lexicon + sentence bank after editing texts
```

## Flow
1. **Setup**: blocking download of the phoneme model (`ModelGate`).
2. **Welcome**: New user (fresh profile) or Returning user (loads IndexedDB).
3. **Reading check**: preset paragraph, opt-in recording.
4. **Results + Review**: each "Practice this sound" gets your clip (±2 s, green/amber word sync)
   next to the reference voice (uniform highlight). Agree confirms; Disagree dismisses this session’s flag and excludes that sound from calibration.
5. **Coach**: local demo clip per confirmed sound, capped start/end, Repeat, credit link.
6. **Practice set**: 5–7 sentences from the Harvard and focused practice banks chosen so each target sound appears in ≥3 different words.
   A target stops being practiced after it comes back Matched in 2 assessed sessions in a row.
7. **Random practice**: unlocked after a sufficiently clear reading with no detected errors; uncertain evidence cannot unlock it.

Settings (⚙): reference voice (Basic browser voice / Natural Kokoro), export/import save file, delete progress.
Tutorial (ⓘ): in the app controls; set `TUTORIAL_VIDEO_SRC` in `src/config.ts` to add a video.

## How sounds are judged
1. Recording is high-pass filtered (80 Hz) and resampled to 16 kHz.
2. The phoneme model runs in a worker and returns, for every 20 ms frame, how likely each sound is.
3. A quick decode + alignment locates each word (and catches skipped/misread words).
4. **GOP scoring**: for each expected sound, the likelihood of an acceptable pronunciation
   (dictionary sound or a normal American variant) is compared with the best alternative
   (any other sound, or nothing).
5. **Verdict rules** (`src/services/engine/decide.ts`). A sound is an error only when every
   enabled rule agrees, which is what keeps false positives down:
   - absolute: beaten by more than `GOP.errorMargin` + the sound's own `PHONE_MARGIN`,
   - session: an outlier within this reading (median − k·MAD),
   - history: an outlier against this speaker's own past scores for that sound,
   - decoded: the free decoding also judged it wrong,
   - cross-check: the optional second model flags it too.
   Rules switch off automatically without enough data. All levers live in `SCORING`,
   `GOP` and `PHONE_MARGIN` in `src/config.ts`.
6. A sound is flagged only if it fails in ≥2 different words and ≥25% of its checked uses.

**Tuning with real voices:** open Diagnostics under the results, read the `gop` column
(negative = an alternative was more likely) and Copy diagnostics JSON. Raise a
`PHONE_MARGIN` entry to flag that sound less, lower `GOP.errorMargin` to flag more.

## Regarding clips
Clips can be accessed in `public/clips/`, and are labeled in `src/services/lessonManifest.ts`, with permission for clips coming from original creator, giving permission for clip use for teaching purposes.

## Known limits
- The TIMIT model folds /ɔ/→/ɑ/ and /ʒ/→/ʃ/, so those pairs can't be coached.
- Analysis speed and memory depend on browser/hardware and whether the second model is enabled; benchmark on your demo computer.
- The Basic voice's word highlighting depends on the browser; some voices give no word timing,
  in which case the whole phrase highlights while it plays.
