import type { MxRecord } from 'node:dns'
import type { EmailPatternUsage } from './find-lead'

export interface Domain {
    name: string
    emailPatternUsage: EmailPatternUsage[]
    catchAllEnabled?: boolean
    mxRecords?: MxRecord[]
    createdAt?: Date
    updatedAt?: Date
}
