import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Tauri expects a fixed dev port and serves the built files from dist/.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Local-only folders (old app, launch material) sit next to the repo; keep Vite out of them.
    watch: { ignored: ['**/src-tauri/**', '**/legacy/**', '**/studio-lokal/**', '**/backup/**'] },
  },
  optimizeDeps: { entries: ['index.html'] },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { target: 'es2022', outDir: 'dist' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
