import { defineConfig } from 'cf/config'

export default defineConfig({
    worker: {
        name: 'lead-email-finder-web',
        compatibilityDate: '2026-11-09',
        domains: ['leademailfinder.com'],
        assets: { notFoundHandling: 'single-page-application' },
        observability: {
            enabled: true,
            redactQueryString: true,
            traces: { enabled: true },
        },
    },
})
