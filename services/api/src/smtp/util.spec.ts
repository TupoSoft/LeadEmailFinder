import { describe, expect, it } from '@jest/globals'
import { parseSmtpResponse } from './util'
import type { SmtpResponse } from './dto'
import { SmtpStatusCode } from './enums'

describe('SMTP util', () => {
    describe('parseSmtpResponse', () => {
        it('should handle two consecutive responses', () => {
            const expectedSmtpResponse: SmtpResponse = {
                code: SmtpStatusCode.MailboxBusy,
                enhancedCode: '5.1.1',
                message: '<jonathank@agnewcars.com>: Recipient address rejected: User unknown in relay recipient table',
            }

            const result = parseSmtpResponse(
                '550 5.1.1 <jonathank@agnewcars.com>: Recipient address rejected: User unknown in relay recipient table\r\n421 4.7.0 mailserver.cmp.livemail.co.uk Error: too many errors\r\n',
            )

            expect(result).toEqual(expectedSmtpResponse)
        })
    })
})
