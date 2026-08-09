import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, type VitePlugin } from 'waku/config';
import { createReadStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const serveCssAsStylesheet: VitePlugin = {
  name: 'stillness-dev-css-direct',
  apply: 'serve' as const,
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      if (request.url === '/src/styles.css') request.url = '/src/styles.css?direct';
      next();
    });
  },
};

const serveMediaPipeRuntime: VitePlugin = {
  name: 'stillness-mediapipe-runtime',
  apply: 'serve' as const,
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = request.url?.split('?')[0] ?? '';
      const match = pathname.match(/^\/wasm\/([a-z0-9_.-]+)$/i);
      const filename = match?.[1];
      if (!filename) {
        next();
        return;
      }

      const runtimePath = resolve('public/wasm', filename);
      if (!existsSync(runtimePath)) {
        next();
        return;
      }

      response.setHeader(
        'Content-Type',
        filename.endsWith('.wasm') ? 'application/wasm' : 'application/javascript',
      );
      response.setHeader('Access-Control-Allow-Origin', '*');
      createReadStream(runtimePath).pipe(response);
    });
  },
};

export default defineConfig({
  vite: {
    plugins: [
      serveCssAsStylesheet,
      serveMediaPipeRuntime,
      react(),
      babel({ presets: [reactCompilerPreset()] }),
    ],
    optimizeDeps: {
      exclude: ['@mediapipe/tasks-vision'],
    },
    worker: {
      format: 'es',
    },
  },
});
