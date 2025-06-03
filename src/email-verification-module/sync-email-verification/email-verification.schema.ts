import { EmailPatternEnum, EmailVerificationReason, EmailVerificationSource } from '../../common'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

@Schema({ timestamps: true })
export class EmailVerification {
    @Prop()
    email: string

    @Prop()
    domain: string

    @Prop()
    localPart: string

    @Prop({ type: String, enum: EmailPatternEnum })
    format?: EmailPatternEnum

    @Prop()
    targetExchange?: string

    @Prop()
    mxDomain?: string

    @Prop({ type: Boolean, default: null })
    exists: boolean | null

    @Prop({ type: Boolean, default: null })
    catchAll: boolean | null

    @Prop({ type: String, enum: EmailVerificationReason })
    reason: EmailVerificationReason

    @Prop({ type: [String], enum: EmailVerificationSource })
    sources: EmailVerificationSource[]

    createdAt: Date
}

export const EmailVerificationSchema = SchemaFactory.createForClass(EmailVerification)
