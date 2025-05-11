import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { SmtpVerificationReason } from './enums'

@Schema()
export class SmtpVerification {
    @Prop()
    _id: string

    @Prop()
    reason: SmtpVerificationReason

    @Prop()
    exists: boolean | null

    @Prop()
    targetExchange?: string

    @Prop()
    proxyId?: string
}

export const SmtpVerificationSchema = SchemaFactory.createForClass(SmtpVerification)
