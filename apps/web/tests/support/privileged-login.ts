import { test as base, type TestInfoError } from '@playwright/test'

function safeInvitationError(value: unknown): TestInfoError {
    const stack =
        typeof value === 'object' && value !== null && 'stack' in value && typeof value.stack === 'string'
            ? value.stack
            : ''
    const location = stack.match(
        /(?:invitations-ui|platform-(?:organizations|credits)-ui)\.spec\.ts:\d+:\d+/,
    )?.[0]
    return {
        value: 'Invitation browser validation failed.',
        ...(location ? { stack: location } : {}),
    }
}

function safeServiceClientError(value: unknown): TestInfoError {
    const stack =
        typeof value === 'object' && value !== null && 'stack' in value && typeof value.stack === 'string'
            ? value.stack
            : ''
    const location = stack.match(/service-clients-ui\.spec\.ts:\d+:\d+/)?.[0]
    return { value: 'Service-client browser validation failed.', ...(location ? { stack: location } : {}) }
}

function safeProxyError(value: unknown): TestInfoError {
    const stack =
        typeof value === 'object' && value !== null && 'stack' in value && typeof value.stack === 'string'
            ? value.stack
            : ''
    const location = stack.match(/platform-proxies-ui\.spec\.ts:\d+:\d+/)?.[0]
    return { value: 'Proxy browser validation failed.', ...(location ? { stack: location } : {}) }
}

export const test = base.extend<{
    privilegedAuthPolicy: void
}>({
    privilegedAuthPolicy: [
        async ({ trace, screenshot, video }, runFixture, info) => {
            if (
                process.env.LEF_INVITATION_TEST_PRIVACY === '1' ||
                process.env.LEF_SERVICE_CLIENT_TEST_PRIVACY === '1' ||
                process.env.LEF_PROXY_TEST_PRIVACY === '1'
            ) {
                const sanitize =
                    process.env.LEF_PROXY_TEST_PRIVACY === '1'
                        ? safeProxyError
                        : process.env.LEF_SERVICE_CLIENT_TEST_PRIVACY === '1'
                          ? safeServiceClientError
                          : safeInvitationError
                // Playwright still builds error-context.md from assertion messages
                // when PLAYWRIGHT_NO_COPY_PROMPT disables DOM snapshots. Normalize
                // errors on arrival, before its artifact recorder can persist them.
                // The proxy also covers timeout and late teardown errors; changing
                // reporter output or removing files afterward would be too late.
                info.errors = new Proxy(info.errors, {
                    set(errors, key, value) {
                        return Reflect.set(errors, key, /^\d+$/.test(String(key)) ? sanitize(value) : value)
                    },
                })
            }
            if (process.env.LEF_PROXY_TEST_PRIVACY === '1') {
                // Refuse explicit attachments before Playwright can write credential-bearing bytes.
                info.attach = () => Promise.reject(new Error('Proxy browser attachments are disabled.'))
            }
            if (
                trace !== 'off' ||
                screenshot !== 'off' ||
                video !== 'off' ||
                process.env.PLAYWRIGHT_NO_COPY_PROMPT !== '1' ||
                process.env.DEBUG ||
                process.env.PWDEBUG
            ) {
                // Fail before the page fixture can expose credentials, including file-level option overrides.
                // eslint-disable-next-line @typescript-eslint/only-throw-error
                throw 'Sensitive browser tests require artifact capture and debug output to be disabled.'
            }
            await runFixture()
        },
        { auto: true },
    ],
})

export { expect } from '@playwright/test'
