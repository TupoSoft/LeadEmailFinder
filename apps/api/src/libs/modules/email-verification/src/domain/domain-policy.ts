import type { MxRecord } from 'node:dns'

export interface DomainPolicy {
    name: string
    isVerificationForbidden: boolean
    catchAllEnabled: boolean | null
    isFree: boolean
    isDisposable: boolean
    mxRecords?: MxRecord[]
    createdAt: Date
    updatedAt: Date
}
