import { build } from 'vite';
import { fileURLToPath } from 'node:url';
await build({ configFile: false, logLevel: 'error', build: {
  ssr: fileURLToPath(new URL('../../../packages/core/index.ts', import.meta.url)),
  outDir: fileURLToPath(new URL('../.local-runtime', import.meta.url)), emptyOutDir: true,
  rollupOptions: { output: { entryFileNames: 'core.mjs' } },
} });
