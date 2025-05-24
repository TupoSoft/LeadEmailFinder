import type { MxRecord } from 'node:dns'
import { Expose } from 'class-transformer'
import { IDomainResponseDto } from '../../common'

export class DomainResponseDto implements IDomainResponseDto {
    @Expose()
    name: string

    @Expose()
    catchAllEnabled?: boolean

    @Expose()
    mxRecords?: MxRecord[]

    @Expose()
    isFree?: boolean

    @Expose()
    isDisposable?: boolean

    @Expose()
    isVerificationForbidden?: boolean

    @Expose()
    createdAt: Date

    @Expose()
    updatedAt: Date
}
