import type { EmailVerificationResult } from '../email-verification'

export type FindLeadRequest = { domain: string } & (
    | { firstName: string; lastName?: string }
    | { firstName?: string; lastName: string }
)

export type FindLeadResult = FindLeadRequest & {
    emails: EmailVerificationResult[]
}

export interface FindBulkResponse {
    message: string
    taskId: string
    monitorUrl: string
}

export interface FindBulkStatusResponse {
    status: string
}
