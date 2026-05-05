import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@first-chair/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@first-chair/shared/canonical': resolve(__dirname, '../../packages/shared/src/canonical.ts'),
      '@first-chair/shared/schemas': resolve(__dirname, '../../packages/shared/src/schemas.ts'),
      '@first-chair/shared/types': resolve(__dirname, '../../packages/shared/src/types.ts'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
