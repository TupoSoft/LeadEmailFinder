import { EmailPatternEnum, EmailVerificationReason, EmailVerificationSource } from '../../common'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { AutoMap } from '@automapper/classes'

@Schema({ timestamps: true })
export class EmailVerification {
    @Prop()
    @AutoMap()
    email: string

    @Prop()
    @AutoMap()
    domain: string

    @Prop()
    @AutoMap()
    localPart: string

    @Prop({ type: String, enum: EmailPatternEnum })
    @AutoMap(() => String)
    format?: EmailPatternEnum

    @Prop()
    @AutoMap()
    targetExchange?: string

    @Prop()
    @AutoMap()
    mxDomain?: string

    @Prop({ type: Boolean, default: null })
    @AutoMap(() => Boolean)
    exists: boolean | null

    @Prop({ type: Boolean, default: null })
    @AutoMap(() => Boolean)
    catchAll: boolean | null

    @Prop({ type: String, enum: EmailVerificationReason })
    @AutoMap(() => String)
    reason: EmailVerificationReason

    @Prop({ type: [String], enum: EmailVerificationSource })
    @AutoMap(() => [String])
    sources: EmailVerificationSource[]

    createdAt: Date

    @Prop()
    batchId?: string
}

export const EmailVerificationSchema = SchemaFactory.createForClass(EmailVerification)
EmailVerificationSchema.index({ email: 1, batchId: 1 })
