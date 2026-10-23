import { AuthMailDeliveryError } from './auth-mail-delivery'
import { createMagicLinkMessage } from './magic-link-message'
import { AuthMailTransport, SmtpAuthMailDelivery } from './smtp-auth-mail-delivery'

const FROM = 'Lead Email Finder <no-reply@lef.test>'
const LINK = 'http://localhost:53000/v1/auth/magic-link/verify?token=synthetic-token-value-1234567890'

function transport(sendMail: AuthMailTransport['sendMail']): jest.Mocked<AuthMailTransport> {
    return { sendMail: jest.fn(sendMail), close: jest.fn() }
}

async function rejection(delivery: SmtpAuthMailDelivery, to = 'person@lef.test'): Promise<AuthMailDeliveryError> {
    try {
        await delivery.send(createMagicLinkMessage(to, LINK))
    } catch (error) {
        expect(error).toBeInstanceOf(AuthMailDeliveryError)
        const message = (error as Error).message
        expect(message).not.toContain(to)
        expect(message).not.toContain('synthetic-token')
        return error as AuthMailDeliveryError
    }
    throw new Error('expected delivery to fail')
}

describe('SmtpAuthMailDelivery', () => {
    it('sends a plain-text sign-in message from the configured sender', async () => {
        const smtp = transport(() => Promise.resolve({}))
        await new SmtpAuthMailDelivery(smtp, FROM).send(createMagicLinkMessage('person@lef.test', LINK))

        expect(smtp.sendMail).toHaveBeenCalledWith({
            from: FROM,
            to: 'person@lef.test',
            subject: 'Your Lead Email Finder sign-in link',
            text: expect.stringContaining(LINK) as string,
        })
    })

    it.each(['not-an-address', 'a@b.test\r\nBcc: c@d.test', 'Name <a@b.test>'])(
        'refuses an unsafe recipient before contacting SMTP (%s)',
        async to => {
            const smtp = transport(() => Promise.resolve({}))
            expect((await rejection(new SmtpAuthMailDelivery(smtp, FROM), to)).reason).toBe('invalid-message')
            expect(smtp.sendMail).not.toHaveBeenCalled()
        },
    )

    it('reports a permanent SMTP rejection without provider diagnostics', async () => {
        const smtp = transport(() =>
            Promise.reject(Object.assign(new Error('550 person@lef.test synthetic-token'), { responseCode: 550 })),
        )
        expect((await rejection(new SmtpAuthMailDelivery(smtp, FROM))).reason).toBe('rejected')
    })

    it('reports connection failures and temporary rejections as unavailable', async () => {
        const refused = transport(() =>
            Promise.reject(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ESOCKET' })),
        )
        expect((await rejection(new SmtpAuthMailDelivery(refused, FROM))).reason).toBe('unavailable')

        const deferred = transport(() =>
            Promise.reject(Object.assign(new Error('451 try later'), { responseCode: 451 })),
        )
        expect((await rejection(new SmtpAuthMailDelivery(deferred, FROM))).reason).toBe('unavailable')
    })

    it('bounds a stalled transport with its own deadline', async () => {
        const stalled = transport(() => new Promise(() => undefined))
        expect((await rejection(new SmtpAuthMailDelivery(stalled, FROM, 5))).reason).toBe('unavailable')
    })

    it('closes the owned transport', () => {
        const smtp = transport(() => Promise.resolve({}))
        new SmtpAuthMailDelivery(smtp, FROM).close()
        expect(smtp.close).toHaveBeenCalledTimes(1)
    })
})
