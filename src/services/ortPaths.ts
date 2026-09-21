import { env } from '@huggingface/transformers';

/** Point ONNX Runtime at the locally hosted WASM files (see scripts/copy-ort.mjs). */
export function useLocalOrt() {
  const base = new URL(`${import.meta.env.BASE_URL}ort/`, self.location.origin).href;
  const onnx = env.backends.onnx as { wasm?: { wasmPaths?: string } };
  if (onnx.wasm) onnx.wasm.wasmPaths = base;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
}
