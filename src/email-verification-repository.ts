import type { EmailVerification, EmailVerificationSource } from './entities'
import { Error, model, Schema } from 'mongoose'

export interface EmailVerificationRepository {
    save: (emailVerification: EmailVerification) => Promise<void>
    findById: (id: string) => Promise<EmailVerification>
    findByEmail: (email: string) => Promise<EmailVerification>
}

interface EmailVerificationSchema {
    email: string
    domain: string
    localPart: string
    targetExchange?: string
    verifiedAt?: Date
    success: boolean
    source?: EmailVerificationSource
}

const emailVerificationSchema = new Schema<EmailVerificationSchema>({
    email: {
        type: String,
        required: true,
        index: true,
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

export class EmailVerificationNotFoundError extends Error {
    constructor(fieldName: string, fieldValue: string) {
        super(`EmailVerification with ${fieldName} ${fieldValue} not found`)
    }
}

export class MongooseEmailVerificationRepository implements EmailVerificationRepository {
    private static entityToDataModel(emailVerification: EmailVerification): EmailVerificationSchema {
        return {
            source: emailVerification.source,
            success: emailVerification.success,
            domain: emailVerification.domain,
            email: emailVerification.email,
            localPart: emailVerification.localPart,
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
    findByEmail: (email: string) => Promise<EmailVerification> = async (email: string): Promise<EmailVerification> => {
        const dataModel = await EmailVerificationModel.findOne({ email }).exec()
        if (dataModel === null) throw new EmailVerificationNotFoundError('email', email)
        return MongooseEmailVerificationRepository.dataModelToEntity(dataModel)
    }

    // eslint-disable-next-line @typescript-eslint/class-methods-use-this
    async findById(id: string): Promise<EmailVerification> {
        const dataModel = await EmailVerificationModel.findById(id).exec()
        if (dataModel === null) throw new EmailVerificationNotFoundError('id', id)
        return MongooseEmailVerificationRepository.dataModelToEntity(dataModel)
    }

    // eslint-disable-next-line @typescript-eslint/class-methods-use-this
    async save(emailVerification: EmailVerification): Promise<void> {
        const dataModel = MongooseEmailVerificationRepository.entityToDataModel(emailVerification)
        const newEmailVerification = new EmailVerificationModel(dataModel)
        await newEmailVerification.save()
    }
}
