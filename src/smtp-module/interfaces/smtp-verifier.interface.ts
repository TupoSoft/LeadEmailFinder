import type { SmtpVerifyResponse } from '../../smtp/dto'

export interface ISmtpVerifier {
    verify: (email: string) => Promise<SmtpVerifyResponse>
}
