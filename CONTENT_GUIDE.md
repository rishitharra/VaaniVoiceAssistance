# Vaani 4.3 — media and content guide

All paths below are relative to the extracted `vaani-app` folder. Vaani does not discover videos by filename: the manifest connects a sound to its file. All sounds have text coaching and the tutorial has a text walkthrough.

## Sound demonstration videos

1. We put each mp4 in `public/clips/`. Lowercase filenames required: `th.mp4`, `dh.mp4`, `r.mp4`, `l.mp4`, `v.mp4`, `w.mp4`.
2. We edited `src/services/lessonManifest.ts`. Use the **uppercase canonical sound key**, not the IPA glyph or the example word.
3. If changing sources, credit to: `CLIP_PERMISSIONS.md`.

```ts
TH: {
  src: 'clips/th.mp4',
  captions: 'clips/th.en.vtt', // optional WebVTT captions
  start: 0,
  end: 14,
  credit: {
    creator: 'Your team or original creator',
    title: 'Unvoiced TH demonstration',
    url: 'https://your-source-page.example',
  },
  tip: 'Tongue tip lightly at the upper teeth; let air flow without voicing.',
},
```

`start` and `end` are seconds from the beginning of the file. Omit both to use the whole clip. Several sound entries may reference different intervals of one file. Paths must omit the `public/` prefix and should use forward slashes. The player has Repeat, playback controls, source credit, and optional captions. End caps are intended for short demonstrations, not frame-exact editing; trim the source file when an exact cut matters.

## Sound keys

| Keys | Examples |
| --- | --- |
| TH / DH | thick / the: these are different sounds |
| R / L / ER | read / last / bird |
| V / W / B | voice / warm / boat |
| P / T / D / K / G | pocket / time / do / book / good |
| F / S / Z / SH | food / sun / noisy / shell |
| CH / JH / HH / Y | cheese / June / half / yellow |
| M / N / NG | map / north / sing |
| IY / IH / EH / AE | beach / sit / bed / cat |
| AA / AH / UH / UW | father / cup (or schwa) / book / food |
| EY / AY / OW / AW / OY | bay / my / boat / town / boy |
| DX | quick tongue tap in American water |

`src/services/phonemes/inventory.ts` is the authoritative list. This model inventory merges AO into AA and ZH into SH; do not promise separate assessment of those distinctions. These are General American reference categories, not judgments about whether another accent is valid.

## Tutorial

Put `overview.mp4` in `public/tutorial/`, then set in `src/config.ts`:

```ts
export const TUTORIAL_VIDEO_SRC = 'tutorial/overview.mp4';
```

## Coaching text and pronunciation notes

Edit `src/services/coaching.ts`:

- `ARTICULATION`: uppercase sound keys, one practical placement/airflow cue for each supported sound.
- `WORD_NOTES`: lowercase dictionary spelling (`comfortable`, `thirty`, `would`, etc.). These are curated notes, not automatically generated pronunciations.
- Minimal-pair data is generated automatically into `src/data/contrasts.json`. A contrast is offered only when a CMUdict entry differs by exactly one raw ARPAbet sound after removing stress digits. No invented words. Proper-name/rare-word entries can still occur in CMUdict.

## Sentences and dictionary

Add one sentence per line to `scripts/data/targeted-sentences.txt`. The 20 new lines cover th, R/L, V/W/B, vowel contrasts, connected speech, and endings. Existing Harvard lines remain in `scripts/data/harvard-sentences.txt`.

Run `npm run build:lexicon` to rebuild `lexicon.json`, `sentenceBank.json`, and `contrasts.json`. First run downloads the CMU pronunciation dictionary; later runs use `scripts/.cache/cmudict.dict`. Every sentence word must be in CMUdict; check the console's dropped-sentence count. Do not hand-edit generated JSON. Append new sentences to preserve previous IDs. Changing/reordering the original bank can change saved recent-sentence IDs.

The preset assessment text is `src/data/presetParagraph.ts`. Run the same dictionary rebuild after editing it. Targeted practice chooses sentences for distinct-word coverage; recurrence still requires at least two different words and a 25% error rate.

## Reference audio, models, and offline assets

Reference clips are synthesized from the relevant phrase by the browser voice or optional Kokoro model; no hand-labelled reference audio files are required. Browser-provided voices may need connectivity depending on the OS. Choose downloaded Kokoro for the explicitly local reference-voice path.

`src/config.ts` holds model IDs and parameters. Do not rename model files or replace a model solely because it is newer: vocabularies and scoring margins must be checked. `npm run build` copies the runtime files into `public/ort/`. Model weights download on first use and are cached separately by the browser.

The service worker precaches app/runtime assets, not arbitrary MP4 files. If you need videos offline, add a bounded media caching strategy or include selected small video files in the precache configuration in `vite.config.ts`, rebuild, and test in airplane mode. Browser caches can be evicted; “downloaded” is not a guarantee of permanent retention.

## Check before your demo

```sh
npm ci
npm run check:content
npm test
npm run build
npm run preview
```

Use Node 22.12+ (Node 24 LTS recommended). Serve over HTTPS or localhost; opening `index.html` directly does not support microphone/worker loading. No videos are required for the app to work. Missing/unconfigured clips use text coaching.
