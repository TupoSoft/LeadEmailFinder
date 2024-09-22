import type { EmailVerificationRepository } from '../../domain/repositories/EmailVerificationRepository'
import { model, Schema } from 'mongoose'
import type { EmailVerification } from '../../domain/entities/EmailVerification'
import { CatchAllStatus, DeliveryStatus } from '../../domain/enums'

interface EmailVerificationSchema {
    deliverable?: boolean
    catchAll?: boolean
    email: string
    domain: string
    localPart: string
    targetExchange?: string
    verifiedAt: Date
    error?: string
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
})

const EmailVerificationModel = model('EmailVerification', emailVerificationSchema)

export class MongooseEmailVerificationRepository implements EmailVerificationRepository {
    private static entityToDataModel(emailVerification: EmailVerification): EmailVerificationSchema {
        return {
            domain: emailVerification.domain,
            email: emailVerification.email,
            localPart: emailVerification.localPart,
            verifiedAt: emailVerification.verifiedAt,
            catchAll:
                emailVerification.catchAll !== CatchAllStatus.Unknown
                    ? emailVerification.catchAll === CatchAllStatus.Enabled
                    : undefined,
            deliverable:
                emailVerification.deliveryStatus !== DeliveryStatus.Unknown
                    ? emailVerification.deliveryStatus === DeliveryStatus.Accepted
                    : undefined,
            targetExchange: emailVerification.targetExchange,
        }
    }

    private static dataModelToEntity(emailVerificationSchema: EmailVerificationSchema): EmailVerification {
        return {
            success: false,
            catchAll: this.booleanToCatchAllStatus(emailVerificationSchema.catchAll),
            deliveryStatus: this.deliverableToDeliveryStatus(emailVerificationSchema.deliverable),
            domain: emailVerificationSchema.domain,
            email: emailVerificationSchema.email,
            localPart: emailVerificationSchema.localPart,
            verifiedAt: emailVerificationSchema.verifiedAt,
        }
    }

    private static booleanToCatchAllStatus(catchAll?: boolean): CatchAllStatus {
        if (catchAll === undefined) {
            return CatchAllStatus.Unknown
        } else {
            return catchAll ? CatchAllStatus.Enabled : CatchAllStatus.Disabled
        }
    }

    private static deliverableToDeliveryStatus(deliverable?: boolean): DeliveryStatus {
        console.log('test')
        if (deliverable === undefined) {
            return DeliveryStatus.Unknown
        } else {
            return deliverable ? DeliveryStatus.Accepted : DeliveryStatus.Rejected
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
