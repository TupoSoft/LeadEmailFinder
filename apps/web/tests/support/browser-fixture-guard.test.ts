// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import privileged from '../../playwright.privileged.config'
import billing from '../../playwright.billing.config'
import verification from '../../playwright.verification.config'
import normal from '../../playwright.config'

const root = resolve(import.meta.dirname, '../../../..')

describe('privileged browser fixture integration boundaries', () => {
    it('disables authentication artifacts and automatic page snapshots', () => {
        expect(privileged.use).toMatchObject({ trace: 'off', screenshot: 'off', video: 'off' })
        expect(billing.use).toMatchObject({ trace: 'off', screenshot: 'off', video: 'off' })
        expect(billing.retries).toBe(0)
        expect(billing.workers).toBe(1)
        expect(privileged.retries).toBe(0)
        expect(privileged.workers).toBe(1)
        expect(process.env.PLAYWRIGHT_NO_COPY_PROMPT).toBe('1')
        expect(verification.use).toMatchObject({ trace: 'off', screenshot: 'off', video: 'off' })
        expect(verification.retries).toBe(0)
        expect(verification.workers).toBe(1)
        expect(normal.testIgnore).toEqual(
            expect.arrayContaining([
                'privileged-*.spec.ts',
                'billing.spec.ts',
                'invitations-ui.spec.ts',
                'team-and-invitations.spec.ts',
                'single-verification.spec.ts',
            ]),
        )
    })

    it('requires the shared fixture in privileged suites and prohibits synthetic authentication', () => {
        const e2e = resolve(root, 'apps/web/tests/e2e')
        const suites = readdirSync(e2e).filter(
            name =>
                /^privileged-.*\.spec\.ts$/.test(name) ||
                name === 'billing.spec.ts' ||
                name === 'single-verification.spec.ts',
        )
        expect(suites.length).toBeGreaterThan(0)
        for (const suite of suites) {
            const source = readFileSync(resolve(e2e, suite), 'utf8')
            expect(source).toMatch(/from ['"]\.\.\/support\/privileged-login['"]/)
            expect(source).not.toMatch(
                /storageState|addCookies|client_credentials|clientSecret|\.route\(|reset-password/,
            )
        }
    })

    it('keeps TOTP and fixture material out of production web sources', () => {
        const inspect = (directory: string): void => {
            for (const entry of readdirSync(directory, { withFileTypes: true })) {
                const file = resolve(directory, entry.name)
                if (entry.isDirectory()) inspect(file)
                else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
                    expect(readFileSync(file, 'utf8')).not.toMatch(
                        /browser-fixture|totpSecret|generateTotp|OWNER_PASSWORD|OPERATOR_PASSWORD/,
                    )
                }
            }
        }
        inspect(resolve(root, 'apps/web/src'))
    })
})
