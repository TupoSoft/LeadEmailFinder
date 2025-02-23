import type { MxRecord } from 'node:dns'
import type { EmailPattern } from '../email/enums'

export interface EmailPatternUsage {
    pattern: EmailPattern
    usageCount: number
}

export interface Domain {
    name: string
    emailPatternUsage: EmailPatternUsage[]
    catchAllEnabled?: boolean
    mxRecords?: MxRecord[]
    isFree?: boolean
    isDisposable?: boolean
    createdAt?: Date
    updatedAt?: Date
}
