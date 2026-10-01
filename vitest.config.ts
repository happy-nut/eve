import { defineConfig, mergeConfig } from 'vitest/config';
import vite from './vite.config.ts';

// The editor's behaviour in a DOM (jsdom): *.dom.test.ts. The plain *.test.mjs files run in Node (npm test).
export default mergeConfig(vite, defineConfig({
  resolve: { conditions: ['browser'] },
  test: { environment: 'jsdom', include: ['src/**/*.dom.test.ts'] },
}));
