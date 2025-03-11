import type { MxRecord } from 'node:dns'
import type { EmailPattern } from '../email/enums'

export interface EmailPatternUsage {
    pattern: EmailPattern
    usageCount: number
}

export interface Domain {
    name: string
    catchAllEnabled: boolean
    mxRecords: MxRecord[]
    isFree: boolean
    isDisposable: boolean
    isVerificationForbidden: boolean
    createdAt: Date
    updatedAt: Date
}
