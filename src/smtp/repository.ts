import type { SmtpVerifyResponse } from './dto'

export interface SmtpVerificationResultRepository {
    getById: (id: string) => Promise<SmtpVerifyResponse | null>
    save: (verificationResult: SmtpVerifyResponse) => Promise<void>
}
