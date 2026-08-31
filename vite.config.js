import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  base: process.env.GITHUB_ACTIONS ? '/iahadut-ha-tora-app/' : '/',
  server: {
    // Permite acceder desde un celular conectado a la misma red Wi‑Fi.
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    open: false,
    proxy: {
      '/vaad-api': {
        target: 'https://vaad.ar',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/vaad-api/, '')
      }
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
});
