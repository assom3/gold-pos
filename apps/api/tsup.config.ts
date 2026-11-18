import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  // لا نُصدّر خرائط المصدر مع نسخة الإنتاج كي لا يُكشف الكود الكامل
  sourcemap: process.env.NODE_ENV !== 'production',
  external: ['@prisma/client', '.prisma', '@prisma/client/runtime/library'],
  noExternal: ['@gold/pricing'],
});
