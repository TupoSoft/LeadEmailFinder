import { Expose, Type } from 'class-transformer'
import { EmailPatternEnum } from '@tuposoft/lead-email-finder/common'
import { Email } from '../../../domain/email'

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
    @Type(() => Date)
    createdAt: Date

    @Expose()
    @Type(() => Date)
    updatedAt: Date

    @Expose()
    @Type(() => Date)
    lastVerifiedAt?: Date
}

export function toEmailResponseDto(record: Email): EmailResponseDto {
    return Object.assign(new EmailResponseDto(), {
        email: record.id,
        username: record.username,
        domain: record.domain,
        exists: record.exists,
        format: record.format,
        lastVerificationId: record.lastVerificationId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        lastVerifiedAt: record.lastVerifiedAt,
    })
}
