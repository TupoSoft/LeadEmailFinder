import { EmailVerificationReason, EmailVerificationSource } from '../common'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

@Schema({ timestamps: true })
export class EmailVerification {
    @Prop()
    email: string

    @Prop()
    domain: string

    @Prop()
    localPart: string

    @Prop()
    format?: string

    @Prop()
    targetExchange?: string

    @Prop()
    mxDomain?: string

    @Prop()
    exists: boolean | null

    @Prop()
    catchAll: boolean | null

    @Prop()
    reason?: EmailVerificationReason

    @Prop()
    sources: EmailVerificationSource[]
}

export const EmailVerificationSchema = SchemaFactory.createForClass(EmailVerification)
