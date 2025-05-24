import { EmailPatternEnum, EmailVerificationReason, EmailVerificationSource } from '../common'
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

    @Prop()
    exists: boolean | null

    @Prop()
    catchAll: boolean | null

    @Prop({ type: String, enum: EmailVerificationReason })
    reason: EmailVerificationReason

    @Prop({ type: [String], enum: EmailVerificationSource })
    sources: EmailVerificationSource[]
}

export const EmailVerificationSchema = SchemaFactory.createForClass(EmailVerification)
