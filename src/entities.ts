import type { CatchAllVerificationSource } from './catch-all'
import type { MxRecord } from 'node:dns'

export type EmailVerificationSource = CatchAllVerificationSource | 'SMTP'

export interface EmailVerification {
    domain: string
    email: string
    error?: string
    localPart: string
    mxDomain?: string
    source: EmailVerificationSource
    success: boolean
    targetExchange?: string
    verifiedAt?: Date
}

export interface EmailFormat {
    name: string
    count: number
}

export interface Domain {
    name: string
    emailFormats: EmailFormat[]
    catchAllEnabled?: boolean
    mxRecords?: MxRecord[]
    createdAt?: Date
    updatedAt?: Date
}

export interface Lead {
    firstName: string
    lastName: string
    domain: string
}
