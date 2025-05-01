import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

import { EmailPatternEnum } from './enums'

@Schema()
export class Email {
    @Prop()
    _id: string

    @Prop()
    username: string

    @Prop()
    domain: string

    @Prop()
    exists: boolean | null

    @Prop()
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
