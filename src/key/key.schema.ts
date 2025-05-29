import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { KeyPermissions } from './key.enum'

@Schema({ timestamps: true })
export class Key {
    @Prop({ required: true, unique: true, index: true })
    token: string

    @Prop({ required: true, enum: KeyPermissions, default: [KeyPermissions.READ], type: [String] })
    permissions: KeyPermissions[]

    @Prop({ required: false })
    description: string

    @Prop({ required: true, default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) })
    expiresAt: Date
}

export const KeySchema = SchemaFactory.createForClass(Key)
