import type { MxRecord } from 'node:dns'

export interface IDomainResponseDto {
    name: string

    catchAllEnabled?: boolean

    mxRecords?: MxRecord[]

    isFree?: boolean

    isDisposable?: boolean

    isVerificationForbidden?: boolean

    createdAt: Date

    updatedAt: Date
}
