import type { MxRecord } from 'node:dns'
import { Expose } from 'class-transformer'
import { IDomainResponseDto } from '@tuposoft/lead-email-finder/common'
import { AutoMap } from '@automapper/classes'

export class DomainResponseDto implements IDomainResponseDto {
    @Expose()
    @AutoMap()
    name: string

    @Expose()
    @AutoMap()
    catchAllEnabled?: boolean

    @Expose()
    @AutoMap()
    mxRecords?: MxRecord[]

    @Expose()
    @AutoMap()
    isFree?: boolean

    @Expose()
    @AutoMap()
    isDisposable?: boolean

    @Expose()
    @AutoMap()
    isVerificationForbidden?: boolean

    @Expose()
    @AutoMap()
    createdAt: Date

    @Expose()
    @AutoMap()
    updatedAt: Date
}
