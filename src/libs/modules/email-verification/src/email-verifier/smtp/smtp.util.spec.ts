import { parseSmtpResponse } from './smtp.util'

describe('parseSmtpResponse', () => {
    it('preserves the numeric and enhanced codes used for SMTP classification', () => {
        expect(parseSmtpResponse('550 5.1.1 Mailbox unavailable')).toEqual({
            code: 550,
            enhancedCode: '5.1.1',
            message: 'Mailbox unavailable',
        })
    })

    it('rejects a malformed reply without copying the raw reply into the error', () => {
        const sentinel = 'unique-person@private.example'

        expect(() => parseSmtpResponse(`Malformed reply for ${sentinel}`)).toThrow('smtp_response_invalid')

        try {
            parseSmtpResponse(`Malformed reply for ${sentinel}`)
        } catch (error) {
            expect(error).toBeInstanceOf(Error)
            expect((error as Error).message).not.toContain(sentinel)
        }
    })
})
