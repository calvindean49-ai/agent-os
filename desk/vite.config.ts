import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

/**
 * The Desk. The page never holds the Runner's token: this dev proxy adds it
 * from .agent-os/token, and refuses a request carrying a foreign Origin, so a
 * page on another site cannot drive the Runner through the browser.
 */
const root = process.cwd();
const tokenPath = join(root, '.agent-os', 'token');
const port = Number(process.env['DESK_PORT'] ?? 5180);
const runnerPort = Number(process.env['RUNNER_PORT'] ?? 8800);

export default defineConfig({
  root: 'desk',
  plugins: [react()],
  build: { outDir: '../dist-desk', emptyOutDir: true },
  server: {
    port,
    strictPort: true,
    host: '127.0.0.1',
    fs: { deny: ['.agent-os/**'] },
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${runnerPort}`,
        changeOrigin: false,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            const origin = req.headers['origin'];
            const allowed = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
            if (origin !== undefined && !allowed.includes(origin)) {
              res.statusCode = 403;
              res.end('foreign origin');
              proxyReq.destroy();
              return;
            }
            const token = existsSync(tokenPath) ? readFileSync(tokenPath, 'utf8').trim() : '';
            proxyReq.setHeader('authorization', `Bearer ${token}`);
          });
        },
      },
    },
  },
});
