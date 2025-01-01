import type { MxRecord } from 'node:dns'

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
