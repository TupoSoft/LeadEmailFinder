import { test as base, type Page } from '@playwright/test'
import { browserFixtureEnvironment } from './browser-fixture-environment'
import {
    browserFixtureError,
    readBrowserFixtureMetadata,
    type BrowserFixtureIdentity,
} from './browser-fixture-metadata'
import { hostedMfaLogin } from './hosted-mfa-login'

export const test = base.extend<{
    loginAs: (identity: BrowserFixtureIdentity) => Promise<Page>
    privilegedAuthPolicy: void
}>({
    privilegedAuthPolicy: [
        async ({ trace, screenshot, video }, runFixture) => {
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
                throw browserFixtureError().message
            }
            await runFixture()
        },
        { auto: true },
    ],
    loginAs: async ({ page }, runFixture, info) => {
        await runFixture(async identity => {
            const timeout = info.timeout
            const started = Date.now()
            // Keep the runner from capturing an authentication page on its own timeout. The bounded
            // authentication deadline below closes the context and emits only the sanitized scalar.
            info.setTimeout(0)
            let timer: ReturnType<typeof setTimeout> | undefined
            try {
                await Promise.race([
                    (async () => {
                        const environment = await browserFixtureEnvironment()
                        const metadata = await readBrowserFixtureMetadata(environment.repositoryRoot, environment.seed)
                        if (!metadata) throw browserFixtureError()
                        await hostedMfaLogin({
                            ...environment,
                            page,
                            identity,
                            secret: metadata.users[identity].totpSecret,
                        })
                    })(),
                    new Promise<never>((_resolve, reject) => {
                        timer = setTimeout(() => reject(browserFixtureError()), 60_000)
                    }),
                ])
                info.setTimeout(timeout === 0 ? 0 : timeout + Date.now() - started)
                return page
            } catch {
                await page
                    .context()
                    .close()
                    .catch(() => undefined)
                // Playwright serializes a scalar as `value`, avoiding its automatic error-context attachment.
                // The dedicated reporter supplies static recovery guidance. A subprocess guard tests this contract.
                // eslint-disable-next-line @typescript-eslint/only-throw-error
                throw browserFixtureError().message
            } finally {
                clearTimeout(timer)
            }
        })
    },
})

export { expect } from '@playwright/test'
