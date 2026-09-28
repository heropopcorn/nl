import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { handleExport } from './export-service.mjs';
export default defineConfig({
  plugins: [{ name: 'local-video-export', configureServer(server) { server.middlewares.use(async (req, res, next) => { if (!await handleExport(req, res)) next(); }); } }],
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
