import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

import { EmailPatternEnum } from '../../common'

@Schema()
export class Email {
    @Prop()
    _id: string

    @Prop()
    username: string

    @Prop()
    domain: string

    @Prop({ type: Boolean, default: null })
    exists: boolean | null

    @Prop({
        type: String,
        enum: EmailPatternEnum,
    })
    format?: EmailPatternEnum

    @Prop()
    lastVerificationId?: string

    @Prop()
    createdAt: Date

    @Prop()
    updatedAt: Date

    @Prop()
    lastVerifiedAt?: Date
}

export const EmailSchema = SchemaFactory.createForClass(Email)
