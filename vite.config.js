import { defineConfig } from 'vite';

export default defineConfig({
  build: { chunkSizeWarningLimit: 2000 },
  server: { host: '127.0.0.1' },
});
