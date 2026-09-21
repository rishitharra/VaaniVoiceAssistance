import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LESSONS } from '../src/services/lessonManifest';
import { TUTORIAL_VIDEO_SRC } from '../src/config';
import { CANON } from '../src/services/phonemes/inventory';
const root = fileURLToPath(new URL('../public/', import.meta.url));
function localFile(src: string) {
  const target = path.resolve(root, src);
  if (!target.startsWith(root) || !fs.existsSync(target)) throw new Error(`Missing or invalid media path: ${src}`);
}
let configured = 0;
for (const [phone, clip] of Object.entries(LESSONS)) {
  if (!(CANON as readonly string[]).includes(phone)) throw new Error(`Unsupported sound key: ${phone}`);
  if (!clip.src) continue;
  localFile(clip.src);
  if (clip.captions) localFile(clip.captions);
  if (clip.start !== undefined && (!Number.isFinite(clip.start) || clip.start < 0)) throw new Error(`${phone}: invalid start`);
  if (clip.end !== undefined && (!Number.isFinite(clip.end) || clip.end <= (clip.start ?? 0))) throw new Error(`${phone}: end must be after start`);
  if (!clip.credit.creator || !clip.credit.title || !/^https?:\/\//.test(clip.credit.url)) throw new Error(`${phone}: add complete source attribution`);
  configured++;
}
if (TUTORIAL_VIDEO_SRC) localFile(TUTORIAL_VIDEO_SRC);
console.log(`Content paths valid. ${configured}/${CANON.length} sound videos configured; remaining sounds use text coaching. Tutorial: ${TUTORIAL_VIDEO_SRC ? 'configured' : 'text walkthrough'}.`);
