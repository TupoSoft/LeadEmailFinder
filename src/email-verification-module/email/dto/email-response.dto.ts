import { EmailPatternEnum } from '../../../common'
import { Expose } from 'class-transformer'

export class EmailResponseDto {
    @Expose()
    email: string

    @Expose()
    username: string

    @Expose()
    domain: string

    @Expose()
    exists: boolean | null

    @Expose()
    format?: EmailPatternEnum

    @Expose()
    lastVerificationId?: string

    @Expose()
    createdAt: Date

    @Expose()
    updatedAt: Date

    @Expose()
    lastVerifiedAt?: Date
}
