import { BetterAuthConfiguration, createBetterAuthConfiguration } from './better-auth-configuration'

const SECRET = 'synthetic-secret-value-that-is-long-enough'
const BASE: Record<string, unknown> = {
    BETTER_AUTH_SECRET: SECRET,
    APP_BASE_URL: 'http://localhost:53000/',
    POSTGRES_URL: 'postgresql://postgres:synthetic-password@localhost:55432/lef',
    AUTH_MAIL_SMTP_HOST: 'auth-mail',
    AUTH_MAIL_SMTP_PORT: '1025',
    AUTH_MAIL_FROM: 'Lead Email Finder <no-reply@lef.test>',
}

function configure(overrides: Record<string, unknown> = {}): BetterAuthConfiguration {
    const environment = { ...BASE, ...overrides }
    return createBetterAuthConfiguration(name => environment[name])
}

function failure(overrides: Record<string, unknown>): string {
    try {
        configure(overrides)
    } catch (error) {
        return (error as Error).message
    }
    throw new Error('expected configuration to fail')
}

describe('createBetterAuthConfiguration', () => {
    it('accepts the development plaintext Mailpit transport and normalizes the application origin', () => {
        expect(configure()).toEqual({
            secret: SECRET,
            baseUrl: 'http://localhost:53000',
            databaseUrl: BASE.POSTGRES_URL,
            mail: {
                host: 'auth-mail',
                port: 1025,
                secure: false,
                requireTls: false,
                from: BASE.AUTH_MAIL_FROM,
            },
        })
    })

    it('requires TLS for production delivery and an HTTPS application origin', () => {
        expect(configure({ NODE_ENV: 'production', APP_BASE_URL: 'https://app.example.test' }).mail).toMatchObject({
            secure: false,
            requireTls: true,
        })
        expect(
            configure({
                NODE_ENV: 'production',
                APP_BASE_URL: 'https://app.example.test',
                AUTH_MAIL_SMTP_SECURE: 'true',
            }).mail,
        ).toMatchObject({ secure: true, requireTls: false })
        expect(failure({ NODE_ENV: 'production' })).toBe('APP_BASE_URL: https-required')
    })

    it('accepts SMTP credentials only as a pair', () => {
        expect(
            configure({ AUTH_MAIL_SMTP_USER: 'mailer', AUTH_MAIL_SMTP_PASSWORD: 'synthetic-pass' }).mail,
        ).toMatchObject({
            user: 'mailer',
            password: 'synthetic-pass',
        })
        expect(failure({ AUTH_MAIL_SMTP_USER: 'mailer' })).toBe('AUTH_MAIL_SMTP_USER: requires AUTH_MAIL_SMTP_PASSWORD')
        expect(failure({ AUTH_MAIL_SMTP_PASSWORD: 'synthetic-pass' })).toBe(
            'AUTH_MAIL_SMTP_USER: requires AUTH_MAIL_SMTP_PASSWORD',
        )
    })

    it.each([
        [{ BETTER_AUTH_SECRET: undefined }, 'BETTER_AUTH_SECRET: missing'],
        [{ BETTER_AUTH_SECRET: 'short-synthetic-secret' }, 'BETTER_AUTH_SECRET: too-short'],
        [{ APP_BASE_URL: 'http://user:synthetic@localhost:53000' }, 'APP_BASE_URL: unsupported-url'],
        [{ APP_BASE_URL: 'javascript:alert(1)' }, 'APP_BASE_URL: unsupported-url'],
        [{ POSTGRES_URL: 'mysql://synthetic@localhost/lef' }, 'POSTGRES_URL: unsupported-url'],
        [{ AUTH_MAIL_SMTP_HOST: 'smtp://auth-mail' }, 'AUTH_MAIL_SMTP_HOST: invalid-host'],
        [{ AUTH_MAIL_SMTP_HOST: 'auth-mail:1025' }, 'AUTH_MAIL_SMTP_HOST: invalid-host'],
        [{ AUTH_MAIL_SMTP_PORT: '0' }, 'AUTH_MAIL_SMTP_PORT: invalid-port'],
        [{ AUTH_MAIL_SMTP_PORT: '1025abc' }, 'AUTH_MAIL_SMTP_PORT: invalid-port'],
        [{ AUTH_MAIL_SMTP_SECURE: 'yes' }, 'AUTH_MAIL_SMTP_SECURE: invalid-boolean'],
        [{ AUTH_MAIL_FROM: 'not-an-address' }, 'AUTH_MAIL_FROM: invalid-address'],
        [{ AUTH_MAIL_FROM: 'Name <a@b.test>\r\nBcc: x@y.test' }, 'AUTH_MAIL_FROM: invalid-address'],
    ])('rejects unsafe or incomplete settings without echoing values (%#)', (overrides, message) => {
        const actual = failure(overrides)
        expect(actual).toBe(message)
        for (const value of Object.values(overrides)) {
            if (typeof value === 'string') expect(actual).not.toContain(value)
        }
        expect(actual).not.toContain(SECRET)
    })
})
