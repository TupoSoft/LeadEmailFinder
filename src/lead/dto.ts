import type { EmailVerificationResult } from '../email-verification'

export interface Lead {
    firstName?: string
    lastName?: string
    domain: string
}

export interface FindLeadResult extends Lead {
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
