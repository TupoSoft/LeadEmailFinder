import type { EmailPatternUsage } from '../find-lead'
import type { MxRecord } from 'node:dns'

export interface Domain {
    name: string
    emailPatternUsage: EmailPatternUsage[]
    catchAllEnabled?: boolean
    mxRecords?: MxRecord[]
    createdAt?: Date
    updatedAt?: Date
}
