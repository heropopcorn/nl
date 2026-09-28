import { defineConfig } from '@playwright/test';
const port = Number(process.env.TEST_PORT || 5174);
export default defineConfig({ testDir: './tests/browser', use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1440, height: 960 }, launchOptions: { args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } }, webServer: { command: `npm run dev -- --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false }, reporter: 'list' });
