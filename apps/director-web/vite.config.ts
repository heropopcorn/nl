import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { handleExport } from './export-service.mjs';
import { buildPaths } from './build-paths.mjs';
const paths = buildPaths();
export default defineConfig({
  plugins: [{ name: 'local-video-export', configureServer(server) { server.middlewares.use(async (req, res, next) => { if (process.env.NL_TEST_EXPORT !== '1' || !await handleExport(req, res)) next(); }); } }],
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: paths.publicDir,
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: paths.outDir, emptyOutDir: true },
});
