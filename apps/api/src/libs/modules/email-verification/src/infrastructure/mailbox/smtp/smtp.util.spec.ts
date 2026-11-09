import { parseSmtpResponse } from './smtp.util'

describe('parseSmtpResponse', () => {
    it('preserves the numeric and enhanced codes used for SMTP classification', () => {
        expect(parseSmtpResponse('550 5.1.1 Mailbox unavailable')).toEqual(
            expect.objectContaining({
                code: 550,
                enhancedCode: '5.1.1',
                message: 'Mailbox unavailable',
            }),
        )
    })

    it('normalizes multiline EHLO lines and standalone capabilities', () => {
        expect(
            parseSmtpResponse(
                ['250-smtp.example.test', '250-SIZE 10485760', '250-starttls', '250 PIPELINING'].join('\r\n'),
            ),
        ).toEqual({
            code: 250,
            enhancedCode: '',
            message: 'PIPELINING',
            lines: ['smtp.example.test', 'SIZE 10485760', 'starttls', 'PIPELINING'],
            capabilities: ['SIZE', 'STARTTLS', 'PIPELINING'],
        })
    })

    it('does not treat a capability name embedded in free text as a capability', () => {
        const response = parseSmtpResponse(
            ['250-smtp.example.test', '250-we support STARTTLS after maintenance', '250 SIZE 1024'].join('\r\n'),
        )

        expect(response.capabilities).toEqual(['WE', 'SIZE'])
        expect(response.capabilities).not.toContain('STARTTLS')
    })

    it.each([
        'Malformed reply',
        '250-smtp.example.test\r\n550 STARTTLS',
        '250-smtp.example.test\r\n250-STARTTLS',
        '250 smtp.example.test\r\n250 STARTTLS',
    ])('rejects a malformed reply without copying it into the error: %s', rawResponse => {
        const sentinel = 'unique-person@private.example'

        expect(() => parseSmtpResponse(rawResponse + sentinel)).toThrow('smtp_response_invalid')

        try {
            parseSmtpResponse(rawResponse + sentinel)
        } catch (error) {
            expect(error).toBeInstanceOf(Error)
            expect((error as Error).message).not.toContain(sentinel)
        }
    })
})
