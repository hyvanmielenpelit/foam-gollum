import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    exclude: ['node_modules/**', 'out/**'],
    reporters: process.env.CI ? ['dot'] : ['tree'],
  },
});
