import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Cross-origin isolation lets onnxruntime-web use multiple threads (much faster
// inference). "credentialless" keeps CDN model downloads working. Mirror these
// headers on the host: see public/_headers (Netlify) and vercel.json.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Service worker: caches the app shell + ONNX runtime so Vaani opens offline.
    // Model weights are cached separately by Transformers.js (browser Cache API).
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Vaani',
        short_name: 'Vaani',
        description: 'Pronunciation practice that runs on your device.',
        theme_color: '#1f2544',
        background_color: '#f7f8fb',
        display: 'standalone',
        icons: [],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,wasm,woff,woff2,json,svg,png}'],
        // The bundler's own copy of the ORT wasm is unused (we load public/ort/).
        globIgnores: ['assets/ort-wasm*'],
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers', 'kokoro-js'] },
  server: { headers: isolation },
  preview: { headers: isolation },
});
