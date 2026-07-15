import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, type VitePlugin } from 'waku/config';

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

export default defineConfig({
  vite: {
    plugins: [serveCssAsStylesheet, react(), babel({ presets: [reactCompilerPreset()] })],
  },
});
