import type { EmailVerificationResult } from '../email-verification'

export type FindLeadRequest = { domain: string } & (
    | { firstName: string; lastName?: string }
    | { firstName?: string; lastName: string }
)

export type FindLeadResult = FindLeadRequest & {
    emails: EmailVerificationResult[]
}
