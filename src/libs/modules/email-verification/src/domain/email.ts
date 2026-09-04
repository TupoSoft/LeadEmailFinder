import { EmailPatternEnum } from '@tuposoft/lead-email-finder/common'

export interface Email {
    organizationId: string
    id: string
    username: string
    domain: string
    exists: boolean | null
    format?: EmailPatternEnum
    lastVerificationId?: string
    lastVerifiedAt?: Date
    createdAt: Date
    updatedAt: Date
}

export interface EmailUpdate {
    format?: EmailPatternEnum
    exists?: boolean | null
    lastVerificationId?: string
}
