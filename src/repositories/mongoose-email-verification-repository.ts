import type { EmailVerificationRepository } from './email-verification-repository'
import { model, Schema } from 'mongoose'
import type { EmailVerification, EmailVerificationSource } from '../entities'

interface EmailVerificationSchema {
    deliverable?: boolean
    catchAll?: boolean
    email: string
    domain: string
    localPart: string
    targetExchange?: string
    verifiedAt: Date
    error?: string
    success: boolean
    source?: EmailVerificationSource
}

const emailVerificationSchema = new Schema<EmailVerificationSchema>({
    email: {
        type: String,
        required: true,
    },
    domain: {
        type: String,
        required: true,
    },
    localPart: {
        type: String,
        required: true,
    },
    targetExchange: {
        type: String,
        required: true,
    },
    catchAll: {
        type: Boolean,
    },
    deliverable: {
        type: Boolean,
    },
    verifiedAt: {
        type: Date,
        default: Date.now,
    },
    source: {
        type: String,
        default: 'None',
        required: true,
    },
    success: {
        type: Boolean,
        required: true,
    },
})

const EmailVerificationModel = model('EmailVerification', emailVerificationSchema)

export class MongooseEmailVerificationRepository implements EmailVerificationRepository {
    private static entityToDataModel(emailVerification: EmailVerification): EmailVerificationSchema {
        return {
            source: emailVerification.source,
            success: emailVerification.success,
            domain: emailVerification.domain,
            email: emailVerification.email,
            localPart: emailVerification.localPart,
            verifiedAt: emailVerification.verifiedAt,
            targetExchange: emailVerification.targetExchange,
        }
    }

    private static dataModelToEntity(emailVerificationSchema: EmailVerificationSchema): EmailVerification {
        return {
            source: emailVerificationSchema.source,
            success: emailVerificationSchema.success,
            domain: emailVerificationSchema.domain,
            email: emailVerificationSchema.email,
            localPart: emailVerificationSchema.localPart,
            verifiedAt: emailVerificationSchema.verifiedAt,
        }
    }

    // eslint-disable-next-line @typescript-eslint/class-methods-use-this
    async findById(id: string): Promise<EmailVerification | null> {
        const dataModel = await EmailVerificationModel.findById(id).exec()
        return dataModel !== null ? MongooseEmailVerificationRepository.dataModelToEntity(dataModel) : null
    }

    // eslint-disable-next-line @typescript-eslint/class-methods-use-this
    async save(emailVerification: EmailVerification): Promise<void> {
        const dataModel = MongooseEmailVerificationRepository.entityToDataModel(emailVerification)
        const newEmailVerification = new EmailVerificationModel(dataModel)
        await newEmailVerification.save()
    }
}
