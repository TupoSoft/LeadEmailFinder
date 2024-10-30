import type { CatchAllVerificationSource } from './catch-all'
import type { MxRecord } from 'node:dns'

export type EmailVerificationSource = CatchAllVerificationSource | 'SMTP'

export interface EmailVerification {
    email: string
    domain: string
    localPart: string
    format?: string
    error?: string
    mxDomain?: string
    sources: EmailVerificationSource[]
    exists: boolean
    targetExchange?: string
    verifiedAt?: Date
}

export interface EmailPatternUsage {
    pattern: string
    usageCount: number
}

export interface Domain {
    name: string
    emailPatternUsage: EmailPatternUsage[]
    catchAllEnabled?: boolean
    mxRecords?: MxRecord[]
    createdAt?: Date
    updatedAt?: Date
}

export interface Lead {
    firstName?: string
    lastName?: string
    domain: string
}
