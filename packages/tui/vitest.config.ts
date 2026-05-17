import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'transform' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    // Ink renders are async; default 5s is enough but we surface it
    // explicitly so a slow CI runner doesn't silently flake.
    testTimeout: 10_000,
    // The TUI views render once and assert against the frame buffer —
    // serialising avoids competing for stdout in ink-testing-library
    // when multiple tests boot at once.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
