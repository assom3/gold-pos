import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // افتراضياً على هذا الجهاز فقط. للوصول من الهاتف داخل الشبكة اضبط VITE_HOST=0.0.0.0
    host: process.env.VITE_HOST === '0.0.0.0' ? true : '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: false,
      },
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) {
            return 'react';
          }
          if (id.includes('@tanstack')) return 'query';
          return undefined;
        },
      },
    },
  },
});
