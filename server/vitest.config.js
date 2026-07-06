import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Los tests que tocan la BD comparten estado; correrlos en serie evita colisiones.
    fileParallelism: false
  }
});
