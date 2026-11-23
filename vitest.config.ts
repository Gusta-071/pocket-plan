import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/test/**/*.test.ts', 'web/src/**/*.test.{ts,tsx}'],
    // Os testes da API usam um banco SQLite próprio, recriado a cada execução.
    env: { DATABASE_URL: 'file:./data/test.db' },
    globalSetup: ['server/test/global-setup.ts'],
    // Um arquivo por vez: todos compartilham o mesmo banco de teste.
    fileParallelism: false,
  },
});
