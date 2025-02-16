import type { EmailVerificationResponse } from '../email-verification'

export type FindLeadRequest = { domain: string } & (
    | { firstName: string; lastName?: string }
    | { firstName?: string; lastName: string }
)

export type FindLeadResult = FindLeadRequest & {
    emails: EmailVerificationResponse[]
}

export interface FindBulkResponse {
    message: string
    taskId: string
    monitorUrl: string
}

export interface FindBulkStatusResponse {
    status: string
}
