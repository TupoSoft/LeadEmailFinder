import { EmailPatternEnum } from '../../enums'

export interface EmailResponseDto {
    email: string

    username: string

    domain: string

    exists: boolean | null

    format?: EmailPatternEnum

    lastVerificationId?: string

    createdAt: Date

    updatedAt: Date

    lastVerifiedAt?: Date
}
