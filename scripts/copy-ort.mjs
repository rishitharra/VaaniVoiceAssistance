// Copies ONNX Runtime WASM files into public/ort so inference works offline
// (Transformers.js otherwise fetches them from a CDN at runtime).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules/@huggingface/transformers/dist');
const dst = path.join(root, 'public/ort');
fs.mkdirSync(dst, { recursive: true });
for (const f of fs.readdirSync(src).filter((f) => f.startsWith('ort-wasm'))) {
  fs.copyFileSync(path.join(src, f), path.join(dst, f));
}
console.log('Copied ONNX Runtime files to public/ort');
