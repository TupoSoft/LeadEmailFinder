import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'application',
                    environment: 'jsdom',
                    // Let jsdom provide Storage instead of Node's native globals.
                    execArgv: ['--no-experimental-webstorage'],
                    include: ['src/**/*.test.{ts,tsx}'],
                    setupFiles: ['./src/test/setup.ts'],
                    restoreMocks: true,
                    clearMocks: true,
                    css: true,
                },
            },
        ],
    },
})
