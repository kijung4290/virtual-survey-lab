import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = __dirname;
/** 테스트 전용 SQLite 파일 (개발 DB 를 건드리지 않는다) */
const testDbPath = path.join(root, 'tests', '.tmp', 'test.db');

export default defineConfig({
  resolve: {
    alias: { '@': root },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/setup/globalSetup.ts'],
    env: {
      DATABASE_URL: `file:${testDbPath.replace(/\\/g, '/')}`,
      DEFAULT_LLM_PROVIDER: 'mock',
      DEFAULT_LLM_MODEL: 'mock-deterministic-v1',
    },
    hookTimeout: 120000,
    testTimeout: 60000,
  },
});
