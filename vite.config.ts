import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relatív base, hogy a build Capacitor WebView-ban (iOS/Android) is működjön.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist' },
});
