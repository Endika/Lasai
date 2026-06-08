import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'virtual:pwa-register/react': resolve(__dirname, 'tests/__mocks__/pwa-register-react.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: { reporter: ['text', 'html'], exclude: ['**/*.d.ts', 'src/main.tsx'] },
  },
})
