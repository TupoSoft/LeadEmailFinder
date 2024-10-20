import type { CatchAllVerificationSource } from './catch-all'
import type { MxRecord } from 'node:dns'

export type EmailVerificationSource = CatchAllVerificationSource | 'SMTP'

export interface EmailVerification {
    domain: string
    email: string
    error?: string
    localPart: string
    mxDomain?: string
    source?: EmailVerificationSource
    success: boolean
    targetExchange?: string
    verifiedAt: Date
}

export interface EmailFormat {
    format: string
    usageCount: number
}

export interface Domain {
    name: string
    catchAllEnabled?: boolean
    emailFormats: EmailFormat[]
    mxRecords?: MxRecord[]
    createdAt: Date
    updatedAt?: Date
}
