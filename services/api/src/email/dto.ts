import type { EmailPattern } from './enums'

export interface CreateEmailRequest {
    email: string
    format?: EmailPattern
    exists: boolean | null
}

export interface UpdateEmailRequest {
    format?: EmailPattern
    exists?: boolean | null
}

export interface CreateEmailRecord extends CreateEmailRequest {
    username: string
    domain: string
    lastVerificationId?: string
}

export interface UpdateEmailRecord extends UpdateEmailRequest {
    lastVerificationId?: string
}

export interface GetEmailsRequestQueryParams {
    exists?: boolean | null
    domain?: string
    format?: EmailPattern
    formatExists?: boolean
}
