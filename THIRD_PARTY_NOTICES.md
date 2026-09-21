# Third-party notices

| Component | Use | License |
|---|---|---|
| Transformers.js (`@huggingface/transformers`) | In-browser model runtime | Apache-2.0 |
| ONNX Runtime Web (via Transformers.js) | WASM inference | MIT |
| `vitouphy/wav2vec2-xls-r-300m-timit-phoneme`, ONNX export `robg/speako-phoneme-recognizer` | Phoneme recognition | Apache-2.0 |
| `facebook/wav2vec2-lv-60-espeak-cv-ft`, ONNX export `onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX` | Optional second-opinion phoneme model | Apache-2.0 |
| Kokoro-82M (`onnx-community/Kokoro-82M-v1.0-ONNX`) | Optional natural reference voice | Apache-2.0 |
| kokoro-js | Kokoro runtime | Apache-2.0 |
| phonemizer (npm), bundling eSpeak NG | Text-to-phoneme for Kokoro | Apache-2.0 wrapper; eSpeak NG is GPL-3.0 |
| CMU Pronouncing Dictionary (cmudict) | Expected pronunciations (build time) | BSD-2-Clause |
| Harvard Sentences (IEEE Recommended Practice, 1969) | Practice sentence bank | Published standard, widely redistributed |
| React, React DOM | UI | MIT |
| Tailwind CSS | Styling | MIT |
| vite-plugin-pwa / Workbox | Offline caching | MIT |
| Atkinson Hyperlegible (`@fontsource/atkinson-hyperlegible`) | Typeface | SIL OFL 1.1 |

The preset paragraph is original text written for Vaani. Demonstration clips are
credited in-app and listed in CLIP_PERMISSIONS.md.

The 20 focused practice sentences in scripts/data/targeted-sentences.txt are original additions for this update. Generated contrast data derives from CMUdict (same license as the dictionary). Widely redistributed is not itself a license grant for Harvard Sentences; verify redistribution terms for your release.
