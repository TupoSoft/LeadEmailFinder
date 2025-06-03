import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

import { EmailPatternEnum } from '../../common'
import { AutoMap } from '@automapper/classes'

@Schema()
export class Email {
    @Prop()
    @AutoMap()
    _id: string

    @Prop()
    @AutoMap()
    username: string

    @Prop()
    @AutoMap()
    domain: string

    @Prop({ type: Boolean, default: null })
    @AutoMap()
    exists: boolean | null

    @Prop({
        type: String,
        enum: EmailPatternEnum,
    })
    @AutoMap()
    format?: EmailPatternEnum

    @Prop()
    @AutoMap()
    lastVerificationId?: string

    @Prop()
    @AutoMap()
    createdAt: Date

    @Prop()
    @AutoMap()
    updatedAt: Date

    @Prop()
    @AutoMap()
    lastVerifiedAt?: Date
}

export const EmailSchema = SchemaFactory.createForClass(Email)
