import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { SmtpVerificationReason } from './enums'

@Schema()
export class SmtpVerification {
    @Prop()
    _id: string

    @Prop({ type: String, enum: SmtpVerificationReason })
    reason: SmtpVerificationReason

    @Prop({ type: Boolean })
    exists?: boolean

    @Prop()
    targetExchange?: string

    @Prop()
    proxyId?: string
}

export const SmtpVerificationSchema = SchemaFactory.createForClass(SmtpVerification)
