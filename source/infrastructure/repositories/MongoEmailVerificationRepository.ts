import type { EmailVerification } from '../../domain/entities/EmailVerification'
import type { EmailVerificationRepository } from '../../domain/repositories/EmailVerificationRepository'
import { model, Schema } from 'mongoose'

const emailVerificationSchema = new Schema<EmailVerification>({
    email: {
        type: String,
        required: true,
    },
    domain: {
        type: String,
        required: true,
    },
    catchAll: {
        type: String,
        required: true,
    },
    error: {
        type: String,
    },
    localPart: {
        type: String,
        required: true,
    },
    verifiedAt: {
        type: Date,
        default: Date.now,
    },
    deliveryStatus: {
        type: String,
        required: true,
    },
    targetExchange: {
        type: String,
        required: true,
    },
})

const EmailVerificationModel = model('EmailVerification', emailVerificationSchema)

export class MongoEmailVerificationRepository implements EmailVerificationRepository {
    async findById(id: string): Promise<EmailVerification | null> {
        return await EmailVerificationModel.findById(id).exec()
    }

    async save(emailVerification: EmailVerification): Promise<void> {
        const newEmailVerification = new EmailVerificationModel(emailVerification)
        await newEmailVerification.save()
    }
}
