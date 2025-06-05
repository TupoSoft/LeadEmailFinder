import { EmailPatternEnum, EmailVerificationReason, EmailVerificationSource } from '../../enums'
import { Types } from 'mongoose'

export interface EmailVerificationEntity {
    _id: Types.ObjectId

    email: string

    domain: string

    localPart: string

    format?: EmailPatternEnum

    targetExchange?: string

    mxDomain?: string

    exists: boolean | null

    catchAll: boolean | null

    reason: EmailVerificationReason

    sources: EmailVerificationSource[]

    createdAt: Date

    batchId?: string
}
