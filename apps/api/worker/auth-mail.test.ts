import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { AuthMailDeliveryError, type AuthMailMessage } from '../src/libs/better-auth/src/mail/auth-mail-delivery.js'
import {
    createMagicLinkMessage,
    MAGIC_LINK_LIFETIME_SECONDS,
} from '../src/libs/better-auth/src/mail/magic-link-message.js'
import { createAuthMailDelivery, validateAuthMailConfiguration, type AuthMailConfiguration } from './auth-mail.js'

const from = 'no-reply@example.test'
const to = 'person@example.test'
const link = 'https://app.example.test/v1/auth/magic-link/verify?token=synthetic-secret'

function configuration(
    send: Env['AUTH_EMAIL']['send'] = () => Promise.resolve({ messageId: 'synthetic-id' }),
): AuthMailConfiguration {
    return { AUTH_MAIL_FROM: from, AUTH_EMAIL: { send } }
}

void describe('Cloudflare authentication mail', () => {
    void it('constructs the existing five-minute, single-use plain-text sign-in message', () => {
        assert.equal(MAGIC_LINK_LIFETIME_SECONDS, 300)
        assert.deepEqual(createMagicLinkMessage(to, link), {
            to,
            subject: 'Your Lead Email Finder sign-in link',
            text: [
                'Use this link to sign in to Lead Email Finder:',
                '',
                link,
                '',
                'The link expires in 5 minutes and works once.',
                'If you did not request it, you can ignore this email.',
            ].join('\n'),
        })
    })

    void it('awaits binding acceptance and sends only the configured sender and message fields', async () => {
        const messages: unknown[] = []
        let accept: (result: EmailSendResult) => void = () => assert.fail('send was not started')
        const delivery = createAuthMailDelivery(
            configuration(message => {
                messages.push(message)

                return new Promise(resolve => {
                    accept = resolve
                })
            }),
        )
        let completed = false

        const pending = delivery.send(createMagicLinkMessage(to, link)).then(() => {
            completed = true
        })
        await Promise.resolve()

        assert.equal(completed, false)
        assert.deepEqual(messages, [{ from, ...createMagicLinkMessage(to, link) }])

        accept({ messageId: 'synthetic-id' })
        await pending

        assert.equal(completed, true)
    })

    void it('maps a configured display name to the structured address field', async () => {
        const messages: unknown[] = []
        const settings = configuration(message => {
            messages.push(message)

            return Promise.resolve({ messageId: 'synthetic-id' })
        })
        settings.AUTH_MAIL_FROM = `Lead Email Finder <${from}>`

        await createAuthMailDelivery(settings).send(createMagicLinkMessage(to, link))

        assert.deepEqual(messages, [
            {
                from: { name: 'Lead Email Finder', email: from },
                ...createMagicLinkMessage(to, link),
            },
        ])
    })

    void it('rejects missing, malformed, multiple, or injected senders without exposing their values', () => {
        const invalidSenders = [
            undefined,
            null,
            42,
            '',
            ' ',
            'private-sender',
            'a@',
            'a@-example.test',
            'a@example.test,b@example.test',
            'Name <a@example.test>, <b@example.test>',
            'a@example.test\r\nBcc: private@example.test',
            'Name\x00 <a@example.test>',
        ]

        for (const sender of invalidSenders) {
            assert.throws(
                // @ts-expect-error Exercise invalid runtime configuration from outside TypeScript.
                () => createAuthMailDelivery({ ...configuration(), AUTH_MAIL_FROM: sender }),
                { message: 'AUTH_MAIL_FROM must be a single email address, optionally with a display name.' },
            )
        }
    })

    void it('rejects a missing or unusable binding at composition time', () => {
        for (const binding of [undefined, null, {}, { send: 'private-value' }]) {
            assert.throws(
                // @ts-expect-error Exercise a missing or invalid runtime binding.
                () => validateAuthMailConfiguration({ ...configuration(), AUTH_EMAIL: binding }),
                { message: 'AUTH_EMAIL must be an Email Service send binding.' },
            )
        }
    })

    void it('rejects unsafe recipients and empty or injected messages before contacting the binding', async () => {
        const send = mock.fn(() => Promise.resolve({ messageId: 'synthetic-id' }))
        const delivery = createAuthMailDelivery(configuration(send))
        const message = createMagicLinkMessage(to, link)
        const invalidMessages: AuthMailMessage[] = [
            { ...message, to: '' },
            { ...message, to: 'a@example.test,b@example.test' },
            { ...message, to: 'a@example.test\r\nBcc: b@example.test' },
            { ...message, to: 'a@example.test\n' },
            { ...message, subject: '' },
            { ...message, subject: ' ' },
            { ...message, subject: 'Sign in\r\nBcc: b@example.test' },
            { ...message, text: '' },
            { ...message, text: ' ' },
        ]

        for (const invalid of invalidMessages) {
            await assert.rejects(delivery.send(invalid), { name: 'AuthMailDeliveryError', reason: 'invalid-message' })
        }

        assert.equal(send.mock.callCount(), 0)
    })

    const failures: [unknown, AuthMailDeliveryError['reason']][] = [
        ['E_SENDER_NOT_VERIFIED', 'rejected'],
        ['E_SENDER_DOMAIN_NOT_AVAILABLE', 'rejected'],
        ['E_RECIPIENT_NOT_ALLOWED', 'rejected'],
        ['E_RECIPIENT_SUPPRESSED', 'rejected'],
        ['E_ACCOUNT_SUSPENDED', 'rejected'],
        ['E_VALIDATION_ERROR', 'invalid-message'],
        ['E_FIELD_MISSING', 'invalid-message'],
        ['E_CONTENT_TOO_LARGE', 'invalid-message'],
        ['E_RATE_LIMIT_EXCEEDED', 'unavailable'],
        ['E_DAILY_LIMIT_EXCEEDED', 'unavailable'],
        ['E_DELIVERY_FAILED', 'unavailable'],
        ['E_INTERNAL_SERVER_ERROR', 'unavailable'],
        [link, 'unavailable'],
        [undefined, 'unavailable'],
    ]

    for (const [index, [code, reason]] of failures.entries()) {
        void it(`redacts provider failure ${index + 1} as ${reason}`, async context => {
            const logs = (['log', 'info', 'warn', 'error'] as const).map(method =>
                context.mock.method(console, method, () => undefined),
            )
            const providerFailure = Object.assign(new Error(`Failed for ${to}: ${link}`), {
                code,
                cause: { text: createMagicLinkMessage(to, link).text },
            })
            const delivery = createAuthMailDelivery(configuration(() => Promise.reject(providerFailure)))

            await assert.rejects(delivery.send(createMagicLinkMessage(to, link)), (error: unknown) => {
                assert.ok(error instanceof AuthMailDeliveryError)
                assert.notEqual(error, providerFailure)
                assert.equal(error.reason, reason)
                assert.equal(error.message, `Authentication mail delivery failed: ${reason}`)
                assert.equal(error.cause, undefined)
                assert.equal('code' in error, false)
                assert.ok(!String(error.stack).includes(to))
                assert.ok(!JSON.stringify(error).includes('synthetic-secret'))

                return true
            })

            assert.ok(logs.every(log => log.mock.callCount() === 0))
        })
    }

    void it('redacts synchronous throws and non-Error failures', async () => {
        for (const failure of [link, null, undefined, { message: link }]) {
            const delivery = createAuthMailDelivery(
                configuration(() => {
                    // eslint-disable-next-line @typescript-eslint/only-throw-error -- Providers may throw non-Error values.
                    throw failure
                }),
            )

            await assert.rejects(delivery.send(createMagicLinkMessage(to, link)), {
                name: 'AuthMailDeliveryError',
                message: 'Authentication mail delivery failed: unavailable',
                reason: 'unavailable',
            })
        }
    })
})
