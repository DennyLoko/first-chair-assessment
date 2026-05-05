import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sharedSrc = resolve(__dirname, '../../packages/shared/src');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: [
      { find: '@first-chair/shared/canonical', replacement: resolve(sharedSrc, 'canonical.ts') },
      { find: '@first-chair/shared/schemas', replacement: resolve(sharedSrc, 'schemas.ts') },
      { find: '@first-chair/shared/types', replacement: resolve(sharedSrc, 'types.ts') },
      { find: '@first-chair/shared', replacement: resolve(sharedSrc, 'index.ts') },
    ],
  },
});
