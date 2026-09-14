import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    define: { __PAYMENTS_CHECKOUT_ALLOWED_ORIGINS__: JSON.stringify(['http://localhost:53000']) },
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'application',
                    environment: 'jsdom',
                    include: ['src/**/*.test.{ts,tsx}'],
                    setupFiles: ['./src/test/setup.ts'],
                    restoreMocks: true,
                    clearMocks: true,
                    css: true,
                },
            },
            {
                test: {
                    name: 'browser-fixtures',
                    environment: 'node',
                    include: ['tests/support/**/*.test.ts'],
                    restoreMocks: true,
                    clearMocks: true,
                },
            },
        ],
    },
})
