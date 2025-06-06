import { EmailPatternEnum } from '../../common'
import { Expose } from 'class-transformer'
import { AutoMap } from '@automapper/classes'

export class EmailResponseDto {
    @Expose()
    @AutoMap()
    email: string

    @Expose()
    @AutoMap()
    username: string

    @Expose()
    @AutoMap()
    domain: string

    @Expose()
    @AutoMap()
    exists: boolean | null

    @Expose()
    @AutoMap()
    format?: EmailPatternEnum

    @Expose()
    @AutoMap()
    lastVerificationId?: string

    @Expose()
    @AutoMap()
    createdAt: Date

    @Expose()
    @AutoMap()
    updatedAt: Date

    @Expose()
    @AutoMap()
    lastVerifiedAt?: Date
}
